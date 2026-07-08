'use strict';
// gen-icons.js — generate PWA PNG icons with zero dependencies (Node zlib).
// Draws the "Ex" mark: navy E + red x on white. Run: node tools/gen-icons.js
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const OUT = path.join(__dirname, '..', 'public', 'icons');
fs.mkdirSync(OUT, { recursive: true });

const BG = [255, 255, 255], NAVY = [27, 33, 102], RED = [225, 17, 28];

function inRoundRect(px, py, x0, y0, x1, y1, r) {
  if (px < x0 || px > x1 || py < y0 || py > y1) return false;
  const ix0 = x0 + r, ix1 = x1 - r, iy0 = y0 + r, iy1 = y1 - r;
  let cx = Math.max(ix0, Math.min(px, ix1));
  let cy = Math.max(iy0, Math.min(py, iy1));
  return Math.hypot(px - cx, py - cy) <= r;
}

function inCapsule(px, py, ax, ay, bx, by, r) {
  const dx = bx - ax, dy = by - ay;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy)) <= r;
}

function drawIcon(S, maskable) {
  const k = maskable ? 0.78 : 1;
  const sc = (v) => 50 + (v - 50) * k;
  const scr = (r) => r * k;
  // "E" glyph: a vertical stem + three horizontal bars, navy.
  // Coordinates on a 0..100 canvas; [x0, y0, x1, y1, radius].
  const bars = [
    [14, 22, 27, 78, 3], // stem
    [14, 22, 48, 34, 3], // top bar
    [14, 44, 43, 56, 3], // middle bar
    [14, 66, 48, 78, 3], // bottom bar
  ];
  // "x" glyph: two diagonal strokes, red; [ax, ay, bx, by, radius].
  const strokes = [
    [57, 34, 87, 72, 6.5],
    [87, 34, 57, 72, 6.5],
  ];

  const data = new Uint8Array(S * S * 4);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const px = 100 * (x + 0.5) / S, py = 100 * (y + 0.5) / S;
      let c = BG;
      for (const [x0, y0, x1, y1, r] of bars) {
        if (inRoundRect(px, py, sc(x0), sc(y0), sc(x1), sc(y1), scr(r))) { c = NAVY; break; }
      }
      if (c === BG) {
        for (const [ax, ay, bx, by, r] of strokes) {
          if (inCapsule(px, py, sc(ax), sc(ay), sc(bx), sc(by), scr(r))) { c = RED; break; }
        }
      }
      const i = (y * S + x) * 4;
      data[i] = c[0]; data[i + 1] = c[1]; data[i + 2] = c[2]; data[i + 3] = 255;
    }
  }
  return data;
}

// ---- minimal PNG encoder (RGBA, filter 0) ----
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const t = Buffer.from(type, 'ascii');
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([t, data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}
function encodePNG(S, rgba) {
  const stride = S * 4;
  const raw = Buffer.alloc((stride + 1) * S);
  for (let y = 0; y < S; y++) {
    raw[y * (stride + 1)] = 0;
    Buffer.from(rgba.buffer, y * stride, stride).copy(raw, y * (stride + 1) + 1);
  }
  const idat = zlib.deflateSync(raw, { level: 9 });
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(S, 0); ihdr.writeUInt32BE(S, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0)),
  ]);
}

function write(name, S, maskable) {
  const png = encodePNG(S, drawIcon(S, maskable));
  fs.writeFileSync(path.join(OUT, name), png);
  console.log('  wrote', name, `(${S}x${S}, ${png.length} bytes)`);
}

console.log('Generating icons ->', OUT);
write('icon-192.png', 192, false);
write('icon-512.png', 512, false);
write('maskable-512.png', 512, true);
write('apple-touch-icon.png', 180, false);
console.log('Done.');
