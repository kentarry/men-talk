'use strict';
// server.js — Zero-knowledge relay + static host. No external dependencies.
//
// What this server CAN see:  a routing token (channelId), message sizes,
//                            timing, online count, and IP addresses (not logged).
// What this server CANNOT see: room secrets, encryption keys, or any message
//                            content. Every payload is an opaque AES-GCM blob
//                            encrypted in the browser. The server only fans it
//                            out to the other sockets in the same channel.
//
// Run:  node server/server.js   (serves ./public and the /ws endpoint)

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = process.env.PORT || 8787;
const HOST = process.env.HOST || '0.0.0.0';
const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const MAX_MESSAGE = 6 * 1024 * 1024;     // 6 MB hard cap per WS message
const WS_GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

// Abuse limits (tune for your deployment via env if desired).
const MAX_CONNECTIONS = Number(process.env.MAX_CONNECTIONS) || 300; // global sockets
const MAX_PER_IP = Number(process.env.MAX_PER_IP) || 15;           // concurrent per IP
const MAX_ROOM_MEMBERS = Number(process.env.MAX_ROOM_MEMBERS) || 100;
const MAX_ROOMS = Number(process.env.MAX_ROOMS) || 2000;
const FRAME_BUDGET = 120;                 // frames per 10s per connection

// Never let one bad request/socket take down the relay for everyone.
process.on('uncaughtException', (err) => console.error('[uncaughtException]', err && err.message));
process.on('unhandledRejection', (err) => console.error('[unhandledRejection]', err && err.message));

// ----------------------------------------------------------------------------
// Static file server
// ----------------------------------------------------------------------------

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
};

const CSP = [
  "default-src 'self'",
  "base-uri 'none'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'none'",
  "img-src 'self' data: blob:",
  "media-src 'self' blob:",
  "connect-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  "worker-src 'self'",
  "manifest-src 'self'",
].join('; ');

function securityHeaders(extra) {
  return Object.assign({
    'Content-Security-Policy': CSP,
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'Permissions-Policy': 'geolocation=(), camera=(), microphone=(), payment=(), usb=()',
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Cross-Origin-Resource-Policy': 'same-origin',
    'X-Frame-Options': 'DENY',
    'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
  }, extra || {});
}

function safeResolve(urlPath) {
  // Strip query/fragment, decode, and prevent path traversal.
  let p;
  try {
    p = decodeURIComponent(urlPath.split('?')[0].split('#')[0]);
  } catch (_) {
    return null; // malformed percent-encoding — reject (prevents URIError crash)
  }
  if (p === '/' || p === '') p = '/index.html';
  const resolved = path.normalize(path.join(PUBLIC_DIR, p));
  if (resolved !== PUBLIC_DIR && !resolved.startsWith(PUBLIC_DIR + path.sep)) {
    return null; // traversal attempt
  }
  return resolved;
}

const server = http.createServer((req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, securityHeaders({ 'Content-Type': 'text/plain' }));
    return res.end('Method Not Allowed');
  }
  const file = safeResolve(req.url);
  if (!file) {
    res.writeHead(400, securityHeaders({ 'Content-Type': 'text/plain' }));
    return res.end('Bad Request');
  }
  fs.readFile(file, (err, data) => {
    if (err) {
      // SPA fallback: unknown non-asset routes serve index.html so shared
      // deep links (e.g. /#<secret>) load the app.
      if (!path.extname(file)) {
        return fs.readFile(path.join(PUBLIC_DIR, 'index.html'), (e2, html) => {
          if (e2) { res.writeHead(404, securityHeaders()); return res.end('Not found'); }
          res.writeHead(200, securityHeaders({ 'Content-Type': MIME['.html'], 'Cache-Control': 'no-cache' }));
          res.end(req.method === 'HEAD' ? undefined : html);
        });
      }
      res.writeHead(404, securityHeaders({ 'Content-Type': 'text/plain' }));
      return res.end('Not found');
    }
    const ext = path.extname(file).toLowerCase();
    // Code and shell must always revalidate so security fixes propagate
    // immediately; only immutable static assets (icons) get a long TTL.
    const revalidate = ['.html', '.js', '.css', '.webmanifest'].includes(ext) || file.endsWith('service-worker.js');
    const cache = revalidate ? 'no-cache' : 'public, max-age=86400';
    res.writeHead(200, securityHeaders({
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Cache-Control': cache,
    }));
    res.end(req.method === 'HEAD' ? undefined : data);
  });
});

// ----------------------------------------------------------------------------
// Minimal RFC 6455 WebSocket implementation (server side)
// ----------------------------------------------------------------------------

const rooms = new Map(); // channelId -> Set<Conn>
let totalConns = 0;
const ipCounts = new Map();

function ipOf(req) { return (req.socket.remoteAddress || '').replace(/^::ffff:/, ''); }

// Reject cross-site WebSocket hijacking: browsers always send Origin; require
// it to match the Host. Non-browser clients (no Origin) are allowed.
function originAllowed(req) {
  const o = req.headers.origin;
  if (!o) return true;
  try { return new URL(o).host === req.headers.host; } catch (_) { return false; }
}

function roomAdd(channelId, conn) {
  let set = rooms.get(channelId);
  if (!set) { set = new Set(); rooms.set(channelId, set); }
  set.add(conn);
  return set;
}

function roomRemove(conn) {
  const set = rooms.get(conn.channelId);
  if (!set) return;
  set.delete(conn);
  if (set.size === 0) rooms.delete(conn.channelId);
  else broadcastPresence(conn.channelId, set);
}

function broadcastPresence(channelId, set) {
  const frame = encodeFrame(0x1, Buffer.from(JSON.stringify({ type: 'presence', count: set.size })));
  for (const c of set) c.socket.write(frame);
}

function sendControl(conn, obj) {
  try { conn.socket.write(encodeFrame(0x1, Buffer.from(JSON.stringify(obj)))); } catch (_) {}
}

class Conn {
  constructor(socket) {
    this.socket = socket;
    this.ip = null;
    this.counted = false;
    this.channelId = null;
    this.buffer = Buffer.alloc(0);
    this.frags = [];           // continuation-frame reassembly
    this.alive = true;
    this.rateWindow = [];      // timestamps for frame-rate limiting
  }
}

server.on('upgrade', (req, socket) => {
  if (req.url.split('?')[0] !== '/ws') { socket.destroy(); return; }
  if (!req.headers['sec-websocket-key']) { socket.destroy(); return; }
  if (!originAllowed(req)) { socket.destroy(); return; }

  const ip = ipOf(req);
  if (totalConns >= MAX_CONNECTIONS || (ipCounts.get(ip) || 0) >= MAX_PER_IP) {
    socket.destroy(); return; // over capacity
  }

  const accept = crypto.createHash('sha1').update(req.headers['sec-websocket-key'] + WS_GUID).digest('base64');
  socket.write(
    'HTTP/1.1 101 Switching Protocols\r\n' +
    'Upgrade: websocket\r\n' +
    'Connection: Upgrade\r\n' +
    'Sec-WebSocket-Accept: ' + accept + '\r\n\r\n'
  );
  socket.setNoDelay(true);

  totalConns++;
  ipCounts.set(ip, (ipCounts.get(ip) || 0) + 1);

  const conn = new Conn(socket);
  conn.ip = ip;
  conn.counted = true;
  const release = () => {
    if (!conn.counted) return;
    conn.counted = false;
    totalConns--;
    const n = (ipCounts.get(ip) || 1) - 1;
    if (n <= 0) ipCounts.delete(ip); else ipCounts.set(ip, n);
  };

  socket.on('data', (chunk) => onData(conn, chunk));
  socket.on('close', () => { conn.alive = false; release(); roomRemove(conn); });
  socket.on('error', () => { conn.alive = false; try { socket.destroy(); } catch (_) {} release(); roomRemove(conn); });
});

function onData(conn, chunk) {
  conn.buffer = conn.buffer.length ? Buffer.concat([conn.buffer, chunk]) : chunk;
  // Process every complete frame currently in the buffer.
  for (;;) {
    const parsed = tryParseFrame(conn.buffer);
    if (parsed === null) return;           // need more bytes
    if (parsed === false) { closeConn(conn, 1002); return; } // protocol error
    conn.buffer = conn.buffer.subarray(parsed.consumed);
    handleFrame(conn, parsed);
    if (!conn.alive) return;
  }
}

// Returns: null (incomplete), false (violation), or {opcode,fin,payload,consumed}
function tryParseFrame(buf) {
  if (buf.length < 2) return null;
  const b0 = buf[0], b1 = buf[1];
  if (b0 & 0x70) return false;             // RSV1-3 must be zero
  const fin = (b0 & 0x80) !== 0;
  const opcode = b0 & 0x0f;
  const masked = (b1 & 0x80) !== 0;
  if (!masked) return false;               // clients MUST mask
  let len = b1 & 0x7f;
  let offset = 2;
  if (len === 126) {
    if (buf.length < offset + 2) return null;
    len = buf.readUInt16BE(offset); offset += 2;
  } else if (len === 127) {
    if (buf.length < offset + 8) return null;
    const big = buf.readBigUInt64BE(offset);
    if (big > BigInt(MAX_MESSAGE)) return false;
    len = Number(big); offset += 8;
  }
  if (len > MAX_MESSAGE) return false;
  // Control frames (opcode >= 0x8) must be <=125 bytes and not fragmented.
  if ((opcode & 0x08) && (len > 125 || !fin)) return false;
  if (buf.length < offset + 4 + len) return null;
  const mask = buf.subarray(offset, offset + 4); offset += 4;
  const payload = Buffer.allocUnsafe(len);
  for (let i = 0; i < len; i++) payload[i] = buf[offset + i] ^ mask[i & 3];
  return { fin, opcode, payload, consumed: offset + len };
}

// Per-connection frame-rate limit. Counts EVERY frame so ping/pong floods are
// throttled just like messages. Returns false when the connection is over budget.
function bumpRate(conn) {
  const now = Date.now();
  conn.rateWindow = conn.rateWindow.filter((t) => now - t < 10000);
  conn.rateWindow.push(now);
  return conn.rateWindow.length <= FRAME_BUDGET;
}

function handleFrame(conn, f) {
  if (f.opcode !== 0x8 && !bumpRate(conn)) {
    // Over budget: drop the frame entirely (do not even reply to pings).
    if (f.opcode === 0x0 || f.opcode === 0x1 || f.opcode === 0x2) conn.frags = [];
    return;
  }
  switch (f.opcode) {
    case 0x8: return closeConn(conn, 1000);           // close
    case 0x9: return void conn.socket.write(encodeFrame(0xA, f.payload)); // ping -> pong
    case 0xA: conn.alive = true; return;              // pong
    case 0x0: // continuation
    case 0x1: // text
    case 0x2: { // binary
      if (f.opcode !== 0x0) { conn.frags = []; }
      conn.frags.push(f.payload);
      const total = conn.frags.reduce((n, p) => n + p.length, 0);
      if (total > MAX_MESSAGE) return closeConn(conn, 1009);
      if (!f.fin) return;                              // wait for more fragments
      const full = Buffer.concat(conn.frags);
      conn.frags = [];
      return onMessage(conn, full.toString('utf8'));
    }
    default: return closeConn(conn, 1002);
  }
}

function onMessage(conn, text) {
  let m;
  try { m = JSON.parse(text); } catch (_) { return; }
  if (!m || typeof m !== 'object') return;

  if (m.type === 'join') {
    // channelId is a 32-hex routing token derived client-side. Validate shape.
    if (typeof m.channel !== 'string' || !/^[0-9a-f]{32}$/.test(m.channel)) return;
    const existing = rooms.get(m.channel);
    if (!existing && rooms.size >= MAX_ROOMS) { sendControl(conn, { type: 'error', reason: 'server_busy' }); return; }
    if (existing && !existing.has(conn) && existing.size >= MAX_ROOM_MEMBERS) {
      sendControl(conn, { type: 'error', reason: 'room_full' }); return;
    }
    if (conn.channelId) roomRemove(conn);
    conn.channelId = m.channel;
    const set = roomAdd(m.channel, conn);
    broadcastPresence(m.channel, set);
    return;
  }

  if (m.type === 'msg') {
    if (!conn.channelId) return;
    if (typeof m.payload !== 'string') return;
    const set = rooms.get(conn.channelId);
    if (!set) return;
    // Relay the OPAQUE ciphertext to everyone else in the channel.
    const frame = encodeFrame(0x1, Buffer.from(JSON.stringify({ type: 'msg', payload: m.payload })));
    for (const c of set) {
      if (c !== conn && c.alive) c.socket.write(frame);
    }
    return;
  }
  // Unknown types are ignored.
}

function encodeFrame(opcode, payload) {
  const len = payload.length;
  let header;
  if (len < 126) {
    header = Buffer.from([0x80 | opcode, len]);
  } else if (len < 65536) {
    header = Buffer.allocUnsafe(4);
    header[0] = 0x80 | opcode; header[1] = 126; header.writeUInt16BE(len, 2);
  } else {
    header = Buffer.allocUnsafe(10);
    header[0] = 0x80 | opcode; header[1] = 127; header.writeBigUInt64BE(BigInt(len), 2);
  }
  return Buffer.concat([header, payload]);
}

function closeConn(conn, code) {
  try {
    const body = Buffer.allocUnsafe(2);
    body.writeUInt16BE(code, 0);
    conn.socket.write(encodeFrame(0x8, body));
  } catch (_) {}
  try { conn.socket.end(); } catch (_) {}
  conn.alive = false;
  roomRemove(conn);
}

// Heartbeat: ping every 30s, drop sockets that miss a pong.
setInterval(() => {
  for (const set of rooms.values()) {
    for (const conn of set) {
      if (!conn.alive) { closeConn(conn, 1001); continue; }
      conn.alive = false; // set true again on pong
      try { conn.socket.write(encodeFrame(0x9, Buffer.alloc(0))); } catch (_) {}
    }
  }
}, 30000).unref();

server.listen(PORT, HOST, () => {
  console.log(`\n  Secure chat relay listening on http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}`);
  console.log('  Serving:', PUBLIC_DIR);
  console.log('  Note: open over HTTPS or http://localhost — Web Crypto needs a secure context.\n');
});
