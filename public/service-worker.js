// service-worker.js — offline app shell only. It NEVER stores messages, keys,
// or anything from the WebSocket; those never pass through fetch handlers.
const CACHE = 'securechat-shell-v11';
const SHELL = [
  './',
  'index.html',
  'css/styles.css',
  'js/app.js',
  'js/crypto.js',
  'js/session.js',
  'js/qr.js',
  'js/stickers.js',
  'manifest.webmanifest',
  'icons/favicon.svg',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/maskable-512.png',
  'icons/apple-touch-icon.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // never touch cross-origin
  if (url.pathname === '/ws') return;               // never intercept realtime

  const isCode = /\.(?:js|css)$/.test(url.pathname) || req.mode === 'navigate';
  if (isCode) {
    // Network-first, bypassing the HTTP cache, so code/security updates always
    // win when online. Falls back to the cached shell only when offline.
    e.respondWith(
      fetch(req, { cache: 'no-store' })
        .then((res) => { cachePut(req, res.clone()); return res; })
        .catch(() => caches.match(req).then((m) => m || caches.match('index.html')))
    );
  } else {
    // Static assets (icons, manifest): cache-first for speed/offline.
    e.respondWith(
      caches.match(req).then((m) => m || fetch(req).then((res) => { cachePut(req, res.clone()); return res; }))
    );
  }
});

function cachePut(req, res) {
  if (res && res.ok) caches.open(CACHE).then((c) => c.put(req, res)).catch(() => {});
}
