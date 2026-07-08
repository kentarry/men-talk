// app.js — UI + realtime client. All plaintext stays in this file's memory;
// only ciphertext ever crosses the WebSocket.
import {
  generateSecret, deriveKeys, encryptJSON, decryptJSON,
  b64urlEncode, b64urlDecode, randomBytes, pbkdf2Verifier, timingSafeEqual,
} from './crypto.js';
import { GroupSession } from './session.js';
import { drawQR } from './qr.js';
import { STICKER_PACKS, getSticker } from './stickers.js';

const MAX_FILE = 2 * 1024 * 1024; // 2 MB plaintext cap for shared files

const state = {
  secret: null,
  channelId: null,
  aesKey: null,
  session: null,         // GroupSession: forward-secret sender-keys layer
  ws: null,
  connected: false,
  reconnectAttempts: 0,
  reconnectTimer: null,
  name: localStorage.getItem('sc.name') || '',
  ttl: parseInt(localStorage.getItem('sc.ttl') || '0', 10),
  objectUrls: new Set(),
  manualClose: false,
  pending: [],           // messages composed while offline, flushed on reconnect
};

const $ = (id) => document.getElementById(id);
const els = {};
['banner','welcome','chat','createRoom','statusDot','presence','messages','composer',
 'input','btnSend','btnAttach','fileInput','btnInvite','btnSettings','drawer','drawerClose',
 'drawerBackdrop','nameInput','ttlSelect','fingerprint','btnCopyLink','btnPanic','toast',
 'inviteModal','inviteLink','inviteCopy','inviteClose','dropHint','inviteQr','inviteQrWrap',
 'lockScreen','lockForm','lockInput','lockError','lockControls',
 'btnSticker','stickerPanel','stickerTabs','stickerGrid']
  .forEach((k) => { els[k] = $(k); });

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------

function boot() {
  if (!window.isSecureContext || !crypto.subtle) {
    showBanner('⚠️ 目前不是安全連線環境，加密無法啟用。請透過 HTTPS 或 http://localhost 開啟本頁。');
    // Still show welcome, but disable room creation.
    showScreen(els.welcome);
    els.createRoom.disabled = true;
    return;
  }
  wireStaticUI();
  route();
  window.addEventListener('hashchange', route);
  // If this device has a local lock set, gate the app immediately on open.
  if (hasLock()) lockApp();
}

function route() {
  const secret = readSecretFromHash();
  if (secret) {
    startChat(secret).catch((e) => showBanner('初始化失敗：' + e.message));
  } else {
    teardownWs();
    showScreen(els.welcome);
  }
}

function readSecretFromHash() {
  const h = location.hash.replace(/^#/, '');
  if (!h) return null;
  try {
    const bytes = b64urlDecode(h);
    return bytes.length === 32 ? bytes : null;
  } catch (_) { return null; }
}

// ---------------------------------------------------------------------------
// Chat lifecycle
// ---------------------------------------------------------------------------

async function startChat(secret) {
  state.secret = secret;
  const { channelId, aesKey, fingerprint } = await deriveKeys(secret);
  state.channelId = channelId;
  state.aesKey = aesKey;
  // Forward-secret group layer. It emits/consumes "inner" objects; we wrap every
  // one in the room-key envelope (sendInner) so the link authenticates the
  // handshake, while message content stays encrypted under ephemeral chain keys.
  state.session = new GroupSession({
    send: (inner) => sendInner(inner),
    onMessage: (obj) => renderMessage(obj, false),
    onError: () => {},
  });
  els.fingerprint.textContent = fingerprint;
  els.nameInput.value = state.name;
  els.ttlSelect.value = String(state.ttl);
  clearMessages();
  showScreen(els.chat);
  connectWs();
  systemMsg('這個房間採端對端加密（前向保密）。只有持有此連結的人能讀取訊息，且新加入者讀不到先前的訊息。');
}

// Wrap one inner (handshake or content) message in the room-key AES-GCM envelope
// and put it on the wire. Fire-and-forget; the protocol tolerates reordering.
function sendInner(inner) {
  if (!isOpen()) return;
  encryptJSON(state.aesKey, inner)
    .then((payload) => {
      if (isOpen()) state.ws.send(JSON.stringify({ type: 'msg', channel: state.channelId, payload }));
    })
    .catch(() => {});
}

function connectWs() {
  teardownWs();
  state.manualClose = false;
  setStatus('connecting');
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  const ws = new WebSocket(`${proto}://${location.host}/ws`);
  state.ws = ws;

  ws.onopen = () => {
    if (ws !== state.ws) return; // ignore a stale socket's late open
    state.connected = true;
    state.reconnectAttempts = 0;
    setStatus('connected');
    try { ws.send(JSON.stringify({ type: 'join', channel: state.channelId })); } catch (_) {}
    // Announce ourselves and (re)establish sender keys, then flush any queue.
    if (state.session) {
      const p = state.session.started ? state.session.resume() : state.session.start();
      Promise.resolve(p).catch(() => {}).finally(flushPending);
    } else {
      flushPending();
    }
  };
  ws.onmessage = (ev) => { if (ws === state.ws) onWsMessage(ev.data); };
  ws.onclose = () => {
    if (ws !== state.ws) return; // a superseded socket closing — ignore
    state.connected = false;
    setStatus('disconnected');
    if (!state.manualClose) scheduleReconnect();
  };
  ws.onerror = () => { try { ws.close(); } catch (_) {} };
}

function scheduleReconnect() {
  clearTimeout(state.reconnectTimer);
  const delay = Math.min(1000 * 2 ** state.reconnectAttempts, 15000);
  state.reconnectAttempts++;
  state.reconnectTimer = setTimeout(() => { if (!state.manualClose) connectWs(); }, delay);
}

function teardownWs() {
  clearTimeout(state.reconnectTimer);
  if (state.ws) {
    state.manualClose = true;
    try { state.ws.close(); } catch (_) {}
    state.ws = null;
  }
  state.connected = false;
}

async function onWsMessage(raw) {
  let m;
  try { m = JSON.parse(raw); } catch (_) { return; }
  if (m.type === 'presence') {
    els.presence.textContent = `${m.count} 人在線`;
    return;
  }
  if (m.type === 'error') {
    toast({ room_full: '房間人數已滿，無法加入', server_busy: '伺服器忙碌中，請稍後再試' }[m.reason] || '伺服器錯誤');
    return;
  }
  if (m.type === 'msg' && typeof m.payload === 'string') {
    let inner;
    try {
      inner = await decryptJSON(state.aesKey, m.payload);
    } catch (_) {
      // Outer-envelope auth failure => wrong link or tampering. Reject silently.
      return;
    }
    // Hand off to the forward-secret layer; it decrypts content and calls back
    // renderMessage() only for messages it can verify with a valid chain key.
    if (state.session) state.session.handleInner(inner);
  }
}

// ---------------------------------------------------------------------------
// Sending
// ---------------------------------------------------------------------------

async function sendText() {
  const text = els.input.value.trim();
  if (!text) return;
  els.input.value = '';
  autoGrow();
  const obj = baseMessage({ t: 'text', text });
  const el = renderMessage(obj, true);
  await transmit(obj, el);
}

async function sendFile(file) {
  if (file.size > MAX_FILE) {
    toast(`檔案過大（上限 ${(MAX_FILE / 1024 / 1024).toFixed(0)}MB）`);
    return;
  }
  const buf = new Uint8Array(await file.arrayBuffer());
  const obj = baseMessage({
    t: 'file', name: file.name, mime: file.type || 'application/octet-stream',
    size: file.size, data: b64urlEncode(buf),
  });
  const el = renderMessage(obj, true);
  await transmit(obj, el);
}

async function sendSticker(sid) {
  const obj = baseMessage({ t: 'sticker', sid });
  const el = renderMessage(obj, true);
  await transmit(obj, el);
}

function baseMessage(extra) {
  return Object.assign({
    id: crypto.randomUUID(),
    name: state.name || '匿名',
    ts: Date.now(),
    ttl: state.ttl,
  }, extra);
}

function isOpen() {
  return state.connected && state.ws && state.ws.readyState === WebSocket.OPEN;
}

async function transmit(obj, el) {
  if (!isOpen()) {
    // Queue and mark as pending so it is visibly distinct from a sent message.
    if (el) el.classList.add('pending');
    state.pending.push({ obj, el });
    toast('尚未連線，將在恢復連線後送出');
    return;
  }
  try {
    await state.session.sendContent(obj);
    if (el) el.classList.remove('pending');
  } catch (e) {
    if (el) el.classList.add('failed');
    toast('加密或傳送失敗');
  }
}

// Re-send messages composed while offline, in order, once reconnected.
async function flushPending() {
  if (!state.pending.length || !isOpen() || !state.session) return;
  const queue = state.pending.splice(0);
  for (const { obj, el } of queue) {
    try {
      await state.session.sendContent(obj);
      if (el) el.classList.remove('pending');
    } catch (_) {
      if (el) el.classList.add('failed');
    }
  }
}

// ---------------------------------------------------------------------------
// Rendering (text is inserted via textContent — no HTML injection possible)
// ---------------------------------------------------------------------------

function renderMessage(obj, mine) {
  if (!obj || typeof obj !== 'object') return;
  const wrap = document.createElement('div');
  wrap.className = 'msg ' + (mine ? 'mine' : 'theirs');
  if (obj.id) wrap.dataset.id = obj.id;

  const meta = document.createElement('div');
  meta.className = 'msg-meta';
  const name = document.createElement('span');
  name.className = 'msg-name';
  name.textContent = mine ? '你' : (typeof obj.name === 'string' ? obj.name.slice(0, 24) : '匿名');
  const time = document.createElement('span');
  time.className = 'msg-time';
  time.textContent = formatTime(obj.ts);
  meta.append(name, time);

  const body = document.createElement('div');
  body.className = 'msg-body';
  if (obj.t === 'file') {
    body.appendChild(renderFile(obj));
  } else if (obj.t === 'sticker') {
    wrap.classList.add('sticker');
    body.appendChild(renderSticker(obj));
  } else {
    body.appendChild(linkify(String(obj.text ?? '')));
  }

  wrap.append(meta, body);
  els.messages.appendChild(wrap);
  scrollToBottom();

  const ttl = Number(obj.ttl) || 0;
  if (ttl > 0) {
    // Clamp to ttl-from-now so a skewed/old sender timestamp can never make a
    // "disappearing" message live LONGER than intended on this device.
    const elapsed = Date.now() - (Number(obj.ts) || Date.now());
    const remaining = Math.min(ttl * 1000, ttl * 1000 - elapsed);
    setTimeout(() => removeMessage(wrap), Math.max(0, remaining));
  }
  return wrap;
}

// Strip control chars, bidi overrides (filename-spoofing) and path separators.
function sanitizeName(name) {
  return (String(name || 'file')
    .replace(/[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069/\\]/g, '')
    .slice(0, 120)) || 'file';
}

function renderFile(obj) {
  const frag = document.createDocumentFragment();
  let bytes;
  try { bytes = b64urlDecode(String(obj.data || '')); } catch (_) { bytes = new Uint8Array(0); }

  // Receiver-side cap (mirrors the sender's MAX_FILE) so a hostile peer can't
  // force large blobs into memory by crafting an oversized valid ciphertext.
  if (bytes.length > MAX_FILE) {
    const warn = document.createElement('span');
    warn.className = 'file-link';
    warn.textContent = `📎 ${sanitizeName(obj.name)} · 檔案過大，已略過`;
    frag.appendChild(warn);
    return frag;
  }

  const name = sanitizeName(obj.name);
  const blob = new Blob([bytes], { type: obj.mime || 'application/octet-stream' });
  const url = URL.createObjectURL(blob);
  state.objectUrls.add(url);

  if (typeof obj.mime === 'string' && obj.mime.startsWith('image/')) {
    const img = document.createElement('img');
    img.className = 'msg-image';
    img.alt = name;
    img.src = url;
    img.onerror = () => { URL.revokeObjectURL(url); state.objectUrls.delete(url); };
    frag.appendChild(img);
  }
  const a = document.createElement('a');
  a.className = 'file-link';
  a.href = url;
  a.download = name;
  a.textContent = `📎 ${name} · ${formatSize(obj.size)}`;
  frag.appendChild(a);
  return frag;
}

// Sticker rendering: the wire only carries an id; artwork always comes from
// our own built-in library, so a peer can never inject markup through this.
function renderSticker(obj) {
  const s = getSticker(String(obj.sid || ''));
  const box = document.createElement('div');
  box.className = 'sticker-body';
  if (s) {
    box.innerHTML = s.svg; // trusted static asset shipped with the app
    box.setAttribute('role', 'img');
    box.setAttribute('aria-label', `貼圖：${s.label}`);
  } else {
    box.textContent = '［貼圖：此版本不支援］';
  }
  return box;
}

// Safe linkifier: only turns http(s):// tokens into anchors; everything else
// is plain text nodes, so no markup from a message can execute.
function linkify(text) {
  const frag = document.createDocumentFragment();
  const re = /(https?:\/\/[^\s<>"']+)/gi;
  let last = 0, m;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) frag.appendChild(document.createTextNode(text.slice(last, m.index)));
    const a = document.createElement('a');
    a.href = m[0];
    a.textContent = m[0];
    a.target = '_blank';
    a.rel = 'noopener noreferrer nofollow';
    frag.appendChild(a);
    last = m.index + m[0].length;
  }
  if (last < text.length) frag.appendChild(document.createTextNode(text.slice(last)));
  return frag;
}

function removeMessage(el) {
  if (!el || !el.parentNode) return;
  el.querySelectorAll('a.file-link, img.msg-image').forEach((n) => {
    const u = n.href || n.src;
    if (u && u.startsWith('blob:')) { URL.revokeObjectURL(u); state.objectUrls.delete(u); }
  });
  el.remove();
}

function systemMsg(text) {
  const d = document.createElement('div');
  d.className = 'msg system';
  d.textContent = text;
  els.messages.appendChild(d);
  scrollToBottom();
}

function clearMessages() {
  for (const u of state.objectUrls) URL.revokeObjectURL(u);
  state.objectUrls.clear();
  els.messages.innerHTML = '';
}

// ---------------------------------------------------------------------------
// UI wiring
// ---------------------------------------------------------------------------

function wireStaticUI() {
  els.createRoom.addEventListener('click', () => {
    const secret = generateSecret();
    // replaceState (not location.hash=) avoids adding a separate history entry
    // that a Back/Forward could return to with the key still in the URL.
    history.replaceState(null, '', '#' + b64urlEncode(secret));
    route(); // replaceState does not fire hashchange
  });

  els.composer.addEventListener('submit', (e) => { e.preventDefault(); sendText(); });
  els.input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendText(); }
  });
  els.input.addEventListener('input', autoGrow);

  els.btnSticker.addEventListener('click', toggleStickerPanel);
  // Tapping back into the conversation or the text box tucks the picker away.
  els.messages.addEventListener('click', closeStickerPanel);
  els.input.addEventListener('focus', closeStickerPanel);

  els.btnAttach.addEventListener('click', () => els.fileInput.click());
  els.fileInput.addEventListener('change', () => {
    if (els.fileInput.files[0]) sendFile(els.fileInput.files[0]);
    els.fileInput.value = '';
  });

  // Drag & drop files — enter/leave depth counter avoids flicker when the
  // pointer crosses child elements inside the chat area.
  const chat = els.chat;
  let dragDepth = 0;
  chat.addEventListener('dragenter', (e) => { e.preventDefault(); if (++dragDepth === 1) els.dropHint.classList.remove('hidden'); });
  chat.addEventListener('dragover', (e) => { e.preventDefault(); });
  chat.addEventListener('dragleave', (e) => { e.preventDefault(); if (--dragDepth <= 0) { dragDepth = 0; els.dropHint.classList.add('hidden'); } });
  chat.addEventListener('drop', (e) => {
    e.preventDefault(); dragDepth = 0; els.dropHint.classList.add('hidden');
    const f = e.dataTransfer.files[0]; if (f) sendFile(f);
  });

  // Settings drawer
  els.btnSettings.addEventListener('click', () => { renderLockControls(); openOverlay(els.drawer); });
  els.drawerClose.addEventListener('click', () => closeOverlay(els.drawer));
  els.drawerBackdrop.addEventListener('click', () => closeOverlay(els.drawer));
  els.nameInput.addEventListener('input', () => {
    state.name = els.nameInput.value.trim();
    localStorage.setItem('sc.name', state.name);
  });
  els.ttlSelect.addEventListener('change', () => {
    state.ttl = parseInt(els.ttlSelect.value, 10) || 0;
    localStorage.setItem('sc.ttl', String(state.ttl));
  });

  els.btnCopyLink.addEventListener('click', copyInvite);
  els.btnInvite.addEventListener('click', openInvite);
  els.inviteCopy.addEventListener('click', copyInvite);
  els.inviteClose.addEventListener('click', () => closeOverlay(els.inviteModal));
  els.btnPanic.addEventListener('click', panicWipe);

  // App lock: unlock form + re-lock whenever the app is backgrounded.
  els.lockForm.addEventListener('submit', onUnlockSubmit);
  document.addEventListener('visibilitychange', () => { if (document.hidden) lockApp(); });

  document.addEventListener('keydown', onGlobalKey);

  // Keep the composer above the on-screen keyboard by binding the chat height
  // to the visual viewport (shrinks when the mobile keyboard opens).
  const setAppVH = () => {
    const h = window.visualViewport ? window.visualViewport.height : window.innerHeight;
    document.documentElement.style.setProperty('--appvh', h + 'px');
  };
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', setAppVH);
    window.visualViewport.addEventListener('scroll', setAppVH);
  }
  window.addEventListener('resize', setAppVH);
  setAppVH();
}

function openInvite() {
  els.inviteLink.value = location.href;
  // Render a QR of the invite so the other phone can join by scanning — the
  // key then never touches the clipboard, browser history, or a chat app.
  try {
    drawQR(els.inviteQr, location.href, { scale: 6, margin: 4 });
    els.inviteQrWrap.classList.remove('hidden');
  } catch (_) {
    // Link too long for v1–10 (very rare) — fall back to copy-only.
    els.inviteQrWrap.classList.add('hidden');
  }
  openOverlay(els.inviteModal);
}

async function copyInvite() {
  const link = location.href;
  try {
    await navigator.clipboard.writeText(link);
    toast('已複製邀請連結');
  } catch (_) {
    els.inviteLink.value = link;
    els.inviteLink.select();
    toast('請手動複製連結');
  }
}

async function panicWipe() {
  if (!confirm('確定要清除本機的所有訊息與資料嗎？此動作無法復原。')) return;
  teardownWs();
  clearMessages();
  try { localStorage.clear(); sessionStorage.clear(); } catch (_) {}
  try {
    if (window.caches) {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    }
    if (navigator.serviceWorker) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((r) => r.unregister()));
    }
  } catch (_) {}
  // Explicitly drop key material from memory/DOM before navigating away
  // (defense-in-depth; the CryptoKey is non-extractable to begin with).
  state.secret = null; state.aesKey = null; state.channelId = null;
  state.session = null;  // drops ephemeral ECDH keys and all ratchet state
  state.pending = [];
  els.inviteLink.value = ''; els.nameInput.value = '';
  // Replace history entry so the key-bearing URL is dropped from this entry.
  location.replace(location.origin + location.pathname);
}

// ---------------------------------------------------------------------------
// Local app lock (per-device passphrase gate)
// ---------------------------------------------------------------------------
// Protects against someone opening THIS device — not against whoever holds the
// link (the link is still the room's key). We store a salted PBKDF2 hash locally
// and require the passphrase to reveal/interact with the chat. Re-locks whenever
// the app is backgrounded.
const LOCK_KEY = 'sc.lock';
const LOCK_ITER = 210000;
let locked = false;

function lockConfig() {
  try { return JSON.parse(localStorage.getItem(LOCK_KEY) || 'null'); } catch (_) { return null; }
}
function hasLock() { return !!lockConfig() && !!(crypto && crypto.subtle); }

async function setLock(passphrase) {
  const salt = randomBytes(16);
  const hash = await pbkdf2Verifier(passphrase, salt, LOCK_ITER);
  localStorage.setItem(LOCK_KEY, JSON.stringify({
    v: 1, iter: LOCK_ITER, salt: b64urlEncode(salt), hash: b64urlEncode(hash),
  }));
}
async function verifyPass(passphrase) {
  const cfg = lockConfig();
  if (!cfg) return false;
  const hash = await pbkdf2Verifier(passphrase, b64urlDecode(cfg.salt), cfg.iter || LOCK_ITER);
  return timingSafeEqual(hash, b64urlDecode(cfg.hash));
}
function clearLock() { localStorage.removeItem(LOCK_KEY); }

function lockApp() {
  if (!hasLock() || locked) return;
  locked = true;
  els.lockError.classList.add('hidden');
  els.lockInput.value = '';
  els.lockScreen.classList.remove('hidden');
  // Trap focus away from the (covered) chat.
  els.chat.inert = true; els.welcome.inert = true;
  setTimeout(() => els.lockInput.focus(), 40);
}
function unlockApp() {
  locked = false;
  els.lockScreen.classList.add('hidden');
  els.lockInput.value = '';
  els.chat.inert = false; els.welcome.inert = false;
}

async function onUnlockSubmit(e) {
  e.preventDefault();
  const btn = els.lockForm.querySelector('button');
  btn.disabled = true;
  const okPass = await verifyPass(els.lockInput.value).catch(() => false);
  btn.disabled = false;
  if (okPass) { unlockApp(); }
  else {
    els.lockError.classList.remove('hidden');
    els.lockInput.value = '';
    els.lockInput.focus();
  }
}

// Rebuild the lock controls inside the settings drawer to reflect current state.
function renderLockControls() {
  const box = els.lockControls;
  if (!box) return;
  box.textContent = '';
  const mkBtn = (label, cls, fn) => {
    const b = document.createElement('button');
    b.type = 'button'; b.className = cls; b.textContent = label;
    b.addEventListener('click', fn);
    return b;
  };
  if (hasLock()) {
    const status = document.createElement('div');
    status.className = 'lock-status'; status.textContent = '🔒 已啟用';
    box.append(
      status,
      mkBtn('立即鎖定', 'btn', () => { closeOverlay(els.drawer); lockApp(); }),
      mkBtn('移除密碼鎖', 'btn btn-danger', renderRemoveLock),
    );
  } else {
    const inp = document.createElement('input');
    inp.type = 'password'; inp.className = 'lock-set-input';
    inp.placeholder = '設定本機密碼（至少 4 字）'; inp.autocomplete = 'new-password';
    const err = document.createElement('p'); err.className = 'fine lock-inline-err hidden';
    box.append(inp, err, mkBtn('啟用密碼鎖', 'btn btn-primary', async () => {
      if (inp.value.length < 4) { err.textContent = '密碼太短（至少 4 字）'; err.classList.remove('hidden'); return; }
      await setLock(inp.value);
      toast('已啟用本機密碼鎖');
      renderLockControls();
    }));
  }
}

// Inline "confirm current passphrase" flow for removing the lock.
function renderRemoveLock() {
  const box = els.lockControls;
  box.textContent = '';
  const inp = document.createElement('input');
  inp.type = 'password'; inp.className = 'lock-set-input';
  inp.placeholder = '輸入目前的本機密碼'; inp.autocomplete = 'current-password';
  const err = document.createElement('p'); err.className = 'fine lock-inline-err hidden';
  const confirm = document.createElement('button');
  confirm.type = 'button'; confirm.className = 'btn btn-danger'; confirm.textContent = '確認移除';
  confirm.addEventListener('click', async () => {
    if (await verifyPass(inp.value).catch(() => false)) {
      clearLock(); toast('已移除本機密碼鎖'); renderLockControls();
    } else { err.textContent = '密碼錯誤'; err.classList.remove('hidden'); inp.value = ''; inp.focus(); }
  });
  const cancel = document.createElement('button');
  cancel.type = 'button'; cancel.className = 'btn'; cancel.textContent = '取消';
  cancel.addEventListener('click', renderLockControls);
  box.append(inp, err, confirm, cancel);
  inp.focus();
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function setStatus(s) {
  els.statusDot.dataset.state = s;
  const label = { connected: '已連線', connecting: '連線中…', disconnected: '已斷線，重連中…' }[s] || s;
  els.statusDot.title = label;
  els.statusDot.setAttribute('aria-label', '連線狀態：' + label);
}

// Switch the primary screen (welcome <-> chat). Overlays (drawer/modal) are
// independent layers and must NOT hide the screen underneath them.
function showScreen(target) {
  [els.welcome, els.chat].forEach((s) => { if (s) s.classList.toggle('hidden', s !== target); });
}

// Overlays get real modal semantics: move focus in, trap it (via inert on the
// background), restore focus on close, and support Escape.
let lastFocus = null;
function openOverlay(el) {
  lastFocus = document.activeElement;
  els.chat.inert = true;
  els.welcome.inert = true;
  el.classList.remove('hidden');
  const focusable = el.querySelector('button, [href], input, select, textarea');
  if (focusable) focusable.focus();
}
function closeOverlay(el) {
  el.classList.add('hidden');
  els.chat.inert = false;
  els.welcome.inert = false;
  if (lastFocus && lastFocus.focus) lastFocus.focus();
  lastFocus = null;
}
function onGlobalKey(e) {
  if (e.key !== 'Escape') return;
  if (!els.drawer.classList.contains('hidden')) closeOverlay(els.drawer);
  else if (!els.inviteModal.classList.contains('hidden')) closeOverlay(els.inviteModal);
  else if (!els.stickerPanel.classList.contains('hidden')) closeStickerPanel();
}

// ---------------------------------------------------------------------------
// Sticker picker
// ---------------------------------------------------------------------------

let stickerPickerBuilt = false;

function toggleStickerPanel() {
  if (els.stickerPanel.classList.contains('hidden')) {
    buildStickerPicker();
    els.stickerPanel.classList.remove('hidden');
    scrollToBottom();
  } else {
    closeStickerPanel();
  }
}

function closeStickerPanel() {
  els.stickerPanel.classList.add('hidden');
}

function buildStickerPicker() {
  if (stickerPickerBuilt) return;
  stickerPickerBuilt = true;
  for (const p of STICKER_PACKS) {
    const tab = document.createElement('button');
    tab.type = 'button';
    tab.className = 'sticker-tab';
    tab.dataset.pack = p.id;
    tab.textContent = `${p.icon} ${p.name}`;
    tab.addEventListener('click', () => renderStickerGrid(p.id));
    els.stickerTabs.appendChild(tab);
  }
  renderStickerGrid(STICKER_PACKS[0].id);
}

function renderStickerGrid(packId) {
  els.stickerTabs.querySelectorAll('.sticker-tab')
    .forEach((t) => t.classList.toggle('active', t.dataset.pack === packId));
  els.stickerGrid.textContent = '';
  const p = STICKER_PACKS.find((x) => x.id === packId);
  if (!p) return;
  for (const s of p.stickers) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'sticker-item';
    b.title = s.label;
    b.setAttribute('aria-label', `傳送貼圖：${s.label}`);
    b.innerHTML = s.svg; // trusted static asset shipped with the app
    b.addEventListener('click', () => sendSticker(s.id));
    els.stickerGrid.appendChild(b);
  }
}

function autoGrow() {
  els.input.style.height = 'auto';
  els.input.style.height = Math.min(els.input.scrollHeight, 160) + 'px';
}

function scrollToBottom() {
  els.messages.scrollTop = els.messages.scrollHeight;
}

function showBanner(text) {
  els.banner.textContent = text;
  els.banner.classList.remove('hidden');
}

let toastTimer;
function toast(text) {
  els.toast.textContent = text;
  els.toast.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => els.toast.classList.add('hidden'), 2600);
}

function formatTime(ts) {
  const d = new Date(Number(ts) || Date.now());
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatSize(n) {
  n = Number(n) || 0;
  if (n < 1024) return n + ' B';
  if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
  return (n / 1024 / 1024).toFixed(1) + ' MB';
}

// Register service worker (offline app shell only; never caches messages).
if ('serviceWorker' in navigator && window.isSecureContext) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('service-worker.js').catch(() => {});
  });
}

boot();
