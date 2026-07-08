'use strict';
// share.js — One command to expose the local relay over HTTPS via Cloudflare
// Tunnel, so a phone (or a friend) can join. Zero external npm dependencies.
//
//   node tools/share.js          (or: npm run share)
//
// It starts the relay (server/server.js) AND `cloudflared tunnel --url ...`,
// then prints the public https://<name>.trycloudflare.com address prominently.
// The tunnel provider only ever sees end-to-end encrypted blobs — E2EE holds.
//
// If cloudflared is not installed, it prints per-platform install hints and
// keeps the local server running (so http://localhost still works meanwhile).

const { spawn } = require('child_process');
const fs = require('fs');
const http = require('http');
const https = require('https');
const path = require('path');

const PORT = process.env.PORT || 8787;
const ROOT = path.join(__dirname, '..');
const NODE = process.execPath;

// Optional config written by 設定固定網址.bat:
//   { "provider": "ngrok", "ngrokDomain": "xxxx.ngrok-free.dev" }
// Without it we default to a Cloudflare quick tunnel (random URL each run).
let CONFIG = {};
try { CONFIG = JSON.parse(fs.readFileSync(path.join(ROOT, 'share.config.json'), 'utf8')); } catch (_) {}
const PROVIDER = CONFIG.provider === 'ngrok' ? 'ngrok' : 'cloudflare';

let server = null;
let tunnel = null;
let shuttingDown = false;

function log(line) { process.stdout.write(line + '\n'); }

function banner(url) {
  const bar = '─'.repeat(Math.max(28, url.length + 6));
  log('');
  log('  ┌' + bar + '┐');
  log('  │  ✅ 手機/他人可用的 HTTPS 網址：');
  log('  │');
  log('  │    ' + url);
  log('  │');
  log('  │  瀏覽器即將自動開啟 → 建立聊天室 → 分享該連結（含 #金鑰）');
  log('  │  隧道商只看得到密文，端對端加密依然成立。');
  log('  └' + bar + '┘');
  log('');
}

// Open the user's default browser (best-effort, per platform).
function openBrowser(url) {
  try {
    if (process.platform === 'win32') {
      spawn('cmd', ['/c', 'start', '', url], { stdio: 'ignore', detached: true }).unref();
    } else if (process.platform === 'darwin') {
      spawn('open', [url], { stdio: 'ignore', detached: true }).unref();
    } else {
      spawn('xdg-open', [url], { stdio: 'ignore', detached: true }).unref();
    }
  } catch (_) {}
}

// A quick tunnel can 502 for its first seconds. Poll the public URL until it
// actually answers, then open the browser — so the user never lands on a 502.
function waitReachable(url, tries) {
  return new Promise((resolve) => {
    const attempt = (left) => {
      const req = https.get(url, { timeout: 4000 }, (res) => {
        res.resume();
        if (res.statusCode && res.statusCode < 500) return resolve(true);
        retry(left);
      });
      req.on('error', () => retry(left));
      req.on('timeout', () => { req.destroy(); retry(left); });
    };
    const retry = (left) => {
      if (left <= 0) return resolve(false);
      setTimeout(() => attempt(left - 1), 2000);
    };
    attempt(tries);
  });
}

// ---- start the relay --------------------------------------------------------

// Is something already answering on the port? (e.g. a `node server/server.js`
// window the user left open). If so we reuse it instead of dying on EADDRINUSE.
function probePort() {
  return new Promise((resolve) => {
    const req = http.get({ host: 'localhost', port: PORT, path: '/', timeout: 1500 }, (res) => {
      res.resume();
      resolve(true);
    });
    req.on('error', () => resolve(false));
    req.on('timeout', () => { req.destroy(); resolve(false); });
  });
}

function startServer() {
  server = spawn(NODE, ['server/server.js'], {
    cwd: ROOT,
    env: process.env,
    stdio: ['ignore', 'inherit', 'inherit'],
  });
  server.on('exit', (code) => {
    if (shuttingDown) return;
    log(`\n[share] 伺服器已結束（code ${code}）。`);
    shutdown(code || 0);
  });
}

// ---- start the tunnel -------------------------------------------------------

// Shared "the public URL is known" path: show it, wait until it actually
// answers (fresh tunnels can 502/NXDOMAIN briefly), then open the browser.
let announced = false;
function announceUrl(url) {
  if (announced) return;
  announced = true;
  banner(url);
  log('[share] 等待隧道生效中…（最多約 60 秒）');
  waitReachable(url, 30).then((ok) => {
    if (shuttingDown) return;
    log(ok ? '[share] ✅ 隧道已生效，開啟瀏覽器…'
           : '[share] ⚠️ 隧道尚未回應，仍嘗試開啟瀏覽器（若打不開請稍候重新整理）');
    openBrowser(url);
  });
}

function startTunnel() {
  if (PROVIDER === 'ngrok') startNgrok();
  else startCloudflared();
}

function startCloudflared() {
  tunnel = spawn('cloudflared', ['tunnel', '--url', `http://localhost:${PORT}`], {
    cwd: ROOT,
    env: process.env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  const scan = (chunk) => {
    const text = chunk.toString();
    process.stderr.write(text); // cloudflared logs to stderr; keep it visible
    const m = text.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/i);
    if (m) announceUrl(m[0]);
  };
  tunnel.stdout.on('data', scan);
  tunnel.stderr.on('data', scan);

  tunnel.on('error', (err) => {
    if (err && err.code === 'ENOENT') {
      printInstallHelp();
    } else {
      log('[share] 啟動 cloudflared 失敗：' + (err && err.message));
    }
  });
  tunnel.on('exit', (code) => {
    if (shuttingDown) return;
    if (code && code !== 0) log(`\n[share] cloudflared 已結束（code ${code}）。本機伺服器仍在運作。`);
  });
}

// ngrok with the account's free fixed dev domain: the URL is the SAME every
// run, so it never hits slow-DNS problems and friends can bookmark it.
function startNgrok() {
  const args = ['http', String(PORT), '--log', 'stdout'];
  if (CONFIG.ngrokDomain) {
    const domain = String(CONFIG.ngrokDomain).replace(/^https?:\/\//, '').replace(/\/.*$/, '');
    args.push('--url', 'https://' + domain);
  } else {
    log('[share] ⚠️ share.config.json 沒有 ngrokDomain——會拿到每次不同的臨時網址。');
    log('        執行「設定固定網址.bat」可綁定你的免費固定網域。');
  }
  tunnel = spawn('ngrok', args, {
    cwd: ROOT,
    env: process.env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  const scan = (chunk) => {
    const text = chunk.toString();
    process.stdout.write(text);
    const m = text.match(/url=(https:\/\/[^\s"]+)/);
    if (m) announceUrl(m[1]);
    if (/ERR_NGROK_(105|107|4018)/.test(text)) {
      log('');
      log('  ⚠️  ngrok 尚未登入（缺 authtoken）。請執行「設定固定網址.bat」完成一次性設定，');
      log('      或手動執行： ngrok config add-authtoken <你的token>');
      log('');
    }
  };
  tunnel.stdout.on('data', scan);
  tunnel.stderr.on('data', scan);

  tunnel.on('error', (err) => {
    if (err && err.code === 'ENOENT') {
      log('');
      log('  ⚠️  找不到 ngrok——尚未安裝或不在 PATH。');
      log('     安裝： winget install --id ngrok.ngrok --source winget');
      log('     或執行「設定固定網址.bat」會自動幫你安裝與設定。');
      log('     本機伺服器仍在運作：http://localhost:' + PORT);
      log('');
      openBrowser('http://localhost:' + PORT);
    } else {
      log('[share] 啟動 ngrok 失敗：' + (err && err.message));
    }
  });
  tunnel.on('exit', (code) => {
    if (shuttingDown) return;
    if (code && code !== 0) log(`\n[share] ngrok 已結束（code ${code}）。本機伺服器仍在運作。`);
  });
}

function printInstallHelp() {
  log('');
  log('  ⚠️  找不到 cloudflared——尚未安裝或不在 PATH。');
  log('     本機伺服器仍在運作：http://localhost:' + PORT + '（僅本機可加密使用）');
  log('');
  log('     安裝 cloudflared：');
  log('       Windows : winget install --id Cloudflare.cloudflared');
  log('       macOS   : brew install cloudflared');
  log('       Linux   : https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/');
  log('');
  log('     安裝後重新執行： npm run share');
  log('     （或改用 ngrok： ngrok http ' + PORT + '）');
  log('');
  log('     先幫你開啟本機版（只有這台電腦能用、無法分享）…');
  openBrowser('http://localhost:' + PORT);
}

// ---- lifecycle --------------------------------------------------------------

function shutdown(code) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const p of [tunnel, server]) {
    if (p && !p.killed) { try { p.kill(); } catch (_) {} }
  }
  process.exit(typeof code === 'number' ? code : 0);
}

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

(async () => {
  if (await probePort()) {
    log('[share] 偵測到 port ' + PORT + ' 已有伺服器在執行——直接沿用它，只啟動隧道。');
  } else {
    log('[share] 啟動本機中繼伺服器（port ' + PORT + '）…');
    startServer();
  }
  log(PROVIDER === 'ngrok'
    ? '[share] 啟動 ngrok 隧道…' + (CONFIG.ngrokDomain ? '（固定網址：https://' + CONFIG.ngrokDomain + '）' : '')
    : '[share] 啟動 Cloudflare Tunnel…（第一次可能需數秒）');
  startTunnel();
})();
