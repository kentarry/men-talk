// selftest.mjs — crypto correctness checks (no server needed).
// Run: node tools/selftest.mjs
import {
  generateSecret, deriveKeys, encryptJSON, decryptJSON, b64urlEncode, b64urlDecode,
  pbkdf2Verifier, timingSafeEqual,
} from '../public/js/crypto.js';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; } else { fail++; console.log('  ✗ FAIL:', m); } };

// b64url round-trips arbitrary bytes and stays URL-safe
const rb = generateSecret();
ok(b64urlDecode(b64urlEncode(rb)).every((v, i) => v === rb[i]), 'b64url round-trip');
ok(!/[+/=]/.test(b64urlEncode(rb)), 'b64url is URL-safe (no + / =)');

// deriveKeys deterministic for same secret; channelId matches server regex
const s1 = generateSecret();
const a = await deriveKeys(s1), b = await deriveKeys(s1);
ok(a.channelId === b.channelId, 'channelId deterministic');
ok(a.fingerprint === b.fingerprint, 'fingerprint deterministic');
ok(/^[0-9a-f]{32}$/.test(a.channelId), 'channelId matches server regex ^[0-9a-f]{32}$');

// different secret -> different derived values
const c = await deriveKeys(generateSecret());
ok(a.channelId !== c.channelId, 'different secret -> different channelId');
ok(a.fingerprint !== c.fingerprint, 'different secret -> different fingerprint');

// encrypt -> decrypt round trip; ciphertext hides plaintext
const msg = { id: 'x', t: 'text', text: '機密訊息 🔐 secret', ts: 123, ttl: 0 };
const blob = await encryptJSON(a.aesKey, msg);
ok(JSON.stringify(await decryptJSON(a.aesKey, blob)) === JSON.stringify(msg), 'AES-GCM round-trip');
ok(!blob.includes('secret') && !blob.includes('機密'), 'ciphertext does not leak plaintext');

// wrong key rejected (confidentiality)
let threw = false;
try { await decryptJSON(c.aesKey, blob); } catch { threw = true; }
ok(threw, 'wrong key rejected');

// tampered ciphertext rejected (integrity via GCM tag)
threw = false;
const raw = b64urlDecode(blob); raw[raw.length - 1] ^= 1;
try { await decryptJSON(a.aesKey, b64urlEncode(raw)); } catch { threw = true; }
ok(threw, 'tampered ciphertext rejected');

// unique IV -> non-deterministic ciphertext
ok(await encryptJSON(a.aesKey, msg) !== await encryptJSON(a.aesKey, msg), 'random IV per message');

// length-hiding padding: two different short messages -> equal ciphertext size
const shortBlob = await encryptJSON(a.aesKey, { t: 'text', text: 'hi' });
const longerBlob = await encryptJSON(a.aesKey, { t: 'text', text: 'a considerably longer sentence, but still well under the bucket' });
ok(shortBlob.length === longerBlob.length, 'padding hides message length (equal ciphertext size)');

// padding still round-trips across a larger bucket
const big = { id: 'y', t: 'text', text: 'x'.repeat(5000), ts: 1, ttl: 0 };
ok(JSON.stringify(await decryptJSON(a.aesKey, await encryptJSON(a.aesKey, big))) === JSON.stringify(big),
  'round-trip across a larger padding bucket');

// PBKDF2 app-lock verifier: same pass+salt matches; wrong pass does not
const salt = generateSecret().subarray(0, 16);
const h1 = await pbkdf2Verifier('correct horse', salt, 50000);
const h2 = await pbkdf2Verifier('correct horse', salt, 50000);
const h3 = await pbkdf2Verifier('wrong horse', salt, 50000);
ok(timingSafeEqual(h1, h2), 'PBKDF2 verifier deterministic for same passphrase');
ok(!timingSafeEqual(h1, h3), 'PBKDF2 verifier rejects wrong passphrase');

console.log(`\n  crypto self-test: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
