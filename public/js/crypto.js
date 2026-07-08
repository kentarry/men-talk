// crypto.js — End-to-end encryption core (Web Crypto API, zero dependencies)
//
// Design:
//   * The whole room "secret" is one 32-byte random value that lives ONLY in
//     the URL fragment (after '#'). Browsers never send the fragment to the
//     server, so the server never sees it.
//   * From that secret we derive, via HKDF-SHA256 with independent `info`
//     labels, three unrelated outputs:
//       - channelId   : a routing token the server uses to group sockets.
//                       Reveals nothing and cannot decrypt anything.
//       - aesKey       : AES-256-GCM key used for all message encryption.
//                       Never leaves the browser.
//       - fingerprint  : a short human-readable "safety code" members can
//                       compare out-of-band to confirm they share the exact
//                       same room (detects a tampered invite link).
//
// Security context requirement: crypto.subtle is only available in a secure
// context (HTTPS, or http://localhost). See app.js for the user-facing guard.

const TE = new TextEncoder();
const TD = new TextDecoder();
const APP_SALT = TE.encode('secure-chat-hkdf-salt-v1');

// ---- byte / encoding helpers -------------------------------------------------

export function randomBytes(n) {
  return crypto.getRandomValues(new Uint8Array(n));
}

function toHex(bytes) {
  let s = '';
  for (const b of bytes) s += b.toString(16).padStart(2, '0');
  return s;
}

// URL-safe base64 without padding — safe to place in a URL fragment.
export function b64urlEncode(bytes) {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function b64urlDecode(str) {
  const pad = str.length % 4 === 0 ? '' : '='.repeat(4 - (str.length % 4));
  const bin = atob(str.replace(/-/g, '+').replace(/_/g, '/') + pad);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

// ---- key material ------------------------------------------------------------

// A brand-new room secret: 32 cryptographically random bytes.
export function generateSecret() {
  return randomBytes(32);
}

// Derive routing id, AES key, and safety fingerprint from the room secret.
export async function deriveKeys(secret) {
  const base = await crypto.subtle.importKey(
    'raw', secret, 'HKDF', false, ['deriveBits', 'deriveKey']
  );

  const chanBits = await crypto.subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt: APP_SALT, info: TE.encode('channel-id') },
    base, 128
  );
  const channelId = toHex(new Uint8Array(chanBits));

  const aesKey = await crypto.subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt: APP_SALT, info: TE.encode('message-key') },
    base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']
  );

  const fpBits = await crypto.subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt: APP_SALT, info: TE.encode('safety-fingerprint') },
    base, 80
  );
  const fingerprint = formatFingerprint(new Uint8Array(fpBits));

  return { channelId, aesKey, fingerprint };
}

function formatFingerprint(bytes) {
  // 10 bytes -> 5 groups of 4 hex chars, e.g. "3F1A B209 77C4 8E10 D5AB"
  const hex = toHex(bytes).toUpperCase();
  return hex.match(/.{1,4}/g).join(' ');
}

// ---- length-hiding padding ---------------------------------------------------
// The relay can see each ciphertext's size. Without padding that leaks the
// message length (e.g. telling a short "yes" from a long paragraph). We pad the
// plaintext INSIDE the AES-GCM envelope to a size bucket before encrypting, so
// same-bucket messages are indistinguishable by size on the wire.
//
// Padded layout (all encrypted): [4-byte big-endian length][data][zero fill].
const PAD_MIN = 256;       // smallest bucket — short texts all look identical
const PAD_CAP = 262144;    // 256 KiB — above this, step by whole buckets

function paddedSize(n) {
  if (n <= PAD_MIN) return PAD_MIN;
  if (n <= PAD_CAP) { let s = PAD_MIN; while (s < n) s <<= 1; return s; } // powers of two: <2x overhead
  return Math.ceil(n / PAD_CAP) * PAD_CAP;                                // large files: +≤256 KiB
}

function padPlaintext(bytes) {
  const out = new Uint8Array(paddedSize(bytes.length + 4));
  out[0] = (bytes.length >>> 24) & 0xff;
  out[1] = (bytes.length >>> 16) & 0xff;
  out[2] = (bytes.length >>> 8) & 0xff;
  out[3] = bytes.length & 0xff;
  out.set(bytes, 4);
  return out;
}

function unpadPlaintext(bytes) {
  if (bytes.length < 4) throw new Error('bad padding');
  const len = (bytes[0] * 0x1000000) + (bytes[1] << 16) + (bytes[2] << 8) + bytes[3];
  if (len < 0 || len + 4 > bytes.length) throw new Error('bad padding');
  return bytes.subarray(4, 4 + len);
}

// ---- authenticated encryption (AES-256-GCM) ---------------------------------

// Encrypt a JS object -> compact base64url string of (iv‖ciphertext‖tag).
// The plaintext is length-padded before encryption (see padPlaintext).
export async function encryptJSON(aesKey, obj) {
  const iv = randomBytes(12);
  const data = padPlaintext(TE.encode(JSON.stringify(obj)));
  const ct = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, aesKey, data)
  );
  const out = new Uint8Array(iv.length + ct.length);
  out.set(iv, 0);
  out.set(ct, iv.length);
  return b64urlEncode(out);
}

// Decrypt a base64url blob back to the original object.
// Throws if the ciphertext was tampered with (GCM auth tag mismatch) or the
// key is wrong — callers MUST treat a throw as "reject this message".
export async function decryptJSON(aesKey, blob) {
  const buf = b64urlDecode(blob);
  // Minimum valid length: 12-byte IV + 16-byte GCM tag.
  if (buf.length < 28) throw new Error('ciphertext too short');
  const iv = buf.subarray(0, 12);
  const ct = buf.subarray(12);
  const pt = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, aesKey, ct));
  return JSON.parse(TD.decode(unpadPlaintext(pt)));
}

// ---- forward secrecy: ephemeral ECDH + symmetric key ratchet ----------------
// These primitives back the group "sender keys" scheme (see session.js). The
// whole point: message keys derive from EPHEMERAL ECDH secrets that never leave
// a device and are unrelated to the room secret in the URL. So an attacker who
// records ciphertext (e.g. a tunnel/proxy that terminates TLS) and LATER obtains
// the room link still cannot decrypt past messages — the per-message keys are
// gone and cannot be reconstructed from the link.

const RATCHET_SALT = TE.encode('secure-chat-fs-v1');

// One-shot ECDH key pair for this session. Private key is non-extractable and
// only ever used to derive shared secrets in-memory; the public key is shared.
export async function genECDH() {
  return crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' }, false, ['deriveBits']
  );
}

export async function exportPubRaw(publicKey) {
  return new Uint8Array(await crypto.subtle.exportKey('raw', publicKey));
}

export async function importPubRaw(bytes) {
  return crypto.subtle.importKey('raw', bytes, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
}

// HKDF-SHA256 of raw key bytes -> `len` bytes, domain-separated by `info`.
async function hkdfBytes(keyBytes, info, len) {
  const base = await crypto.subtle.importKey('raw', keyBytes, 'HKDF', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt: RATCHET_SALT, info: TE.encode(info) }, base, len * 8
  );
  return new Uint8Array(bits);
}

// Symmetric wrapping key shared by two members (ECDH is symmetric:
// wrap(a.priv,b.pub) === wrap(b.priv,a.pub)). Used to wrap sender-chain keys.
export async function deriveWrapKey(privateKey, peerPublicKey) {
  const shared = new Uint8Array(
    await crypto.subtle.deriveBits({ name: 'ECDH', public: peerPublicKey }, privateKey, 256)
  );
  return hkdfBytes(shared, 'skd-wrap', 32);
}

// One ratchet step: derive this message's key and the NEXT chain key from the
// current chain key. HKDF is one-way, so possessing nextChainKey reveals nothing
// about chainKey or messageKey — the basis of forward secrecy. Callers MUST drop
// the old chainKey and the messageKey right after use.
export async function ratchetStep(chainKey) {
  const messageKey = await hkdfBytes(chainKey, 'msg', 32);
  const nextChainKey = await hkdfBytes(chainKey, 'chain', 32);
  return { messageKey, nextChainKey };
}

// Raw AES-256-GCM over a 32-byte key. Returns iv‖ciphertext‖tag (Uint8Array).
export async function aeadEncrypt(keyBytes, plaintext, aad) {
  const key = await crypto.subtle.importKey('raw', keyBytes, 'AES-GCM', false, ['encrypt']);
  const iv = randomBytes(12);
  const ct = new Uint8Array(await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: aad || new Uint8Array(0) }, key, plaintext
  ));
  const out = new Uint8Array(iv.length + ct.length);
  out.set(iv, 0); out.set(ct, iv.length);
  return out;
}

export async function aeadDecrypt(keyBytes, blob, aad) {
  if (blob.length < 28) throw new Error('ciphertext too short');
  const key = await crypto.subtle.importKey('raw', keyBytes, 'AES-GCM', false, ['decrypt']);
  const iv = blob.subarray(0, 12);
  const ct = blob.subarray(12);
  return new Uint8Array(await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv, additionalData: aad || new Uint8Array(0) }, key, ct
  ));
}

// ---- local app-lock verifier (PBKDF2) ---------------------------------------
// Used only to gate this device's UI behind a passphrase (see app.js). This is
// NOT the message key — it never touches message encryption. We store a salted
// PBKDF2 hash locally and compare against it to unlock.
export async function pbkdf2Verifier(passphrase, salt, iterations) {
  const base = await crypto.subtle.importKey(
    'raw', TE.encode(passphrase), 'PBKDF2', false, ['deriveBits']
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, base, 256
  );
  return new Uint8Array(bits);
}

// Constant-time comparison so unlock timing can't reveal the stored hash.
export function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a[i] ^ b[i];
  return d === 0;
}
