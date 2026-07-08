// test-fs.mjs — Group forward-secrecy scheme tests (no server, no browser).
//
// A tiny in-memory "relay" wires several GroupSession instances together exactly
// like the real broadcast relay: a sent inner message is delivered to every
// OTHER member (never echoed to the sender). Messages are JSON round-tripped to
// mimic the wire. `pump()` runs the bus until quiescent so async handshakes
// settle deterministically.
//
//   node tools/test-fs.mjs
//
// Web Crypto (crypto.subtle, ECDH P-256) is available as a global in Node 18+.

import { GroupSession } from '../public/js/session.js';
import { ratchetStep, aeadEncrypt, aeadDecrypt, genECDH, deriveWrapKey, randomBytes } from '../public/js/crypto.js';

let passed = 0, failed = 0;
function ok(cond, msg) { if (cond) { passed++; } else { failed++; console.error('  ✗ ' + msg); } }

// ---- in-memory broadcast relay ---------------------------------------------

function makeBus() {
  const members = new Map(); // id -> session
  const queue = [];
  function attach(id) {
    const inbox = []; // decrypted chat objects this member received
    const sess = new GroupSession({
      send: (inner) => queue.push({ from: id, inner: JSON.parse(JSON.stringify(inner)) }),
      onMessage: (obj) => inbox.push(obj),
      onError: () => {},
    });
    members.set(id, sess);
    sess._inbox = inbox;
    return sess;
  }
  async function pump() {
    let steps = 0;
    while (queue.length) {
      if (++steps > 100000) throw new Error('pump did not settle');
      const { from, inner } = queue.shift();
      for (const [id, s] of members) {
        if (id !== from) await s.handleInner(JSON.parse(JSON.stringify(inner)));
      }
    }
  }
  return { attach, pump, members, queue };
}

// ---- primitive-level tests --------------------------------------------------

async function testPrimitives() {
  // Ratchet determinism + distinctness.
  const ck = randomBytes(32);
  const a = await ratchetStep(ck);
  const b = await ratchetStep(ck);
  ok(Buffer.from(a.messageKey).equals(Buffer.from(b.messageKey)), 'ratchet is deterministic (msg key)');
  ok(Buffer.from(a.nextChainKey).equals(Buffer.from(b.nextChainKey)), 'ratchet is deterministic (chain key)');
  ok(!Buffer.from(a.messageKey).equals(Buffer.from(a.nextChainKey)), 'message key != next chain key');
  const a2 = await ratchetStep(a.nextChainKey);
  ok(!Buffer.from(a2.messageKey).equals(Buffer.from(a.messageKey)), 'consecutive message keys differ');

  // ECDH symmetry -> identical wrap key on both sides.
  const kpA = await genECDH();
  const kpB = await genECDH();
  const wa = await deriveWrapKey(kpA.privateKey, kpB.publicKey);
  const wb = await deriveWrapKey(kpB.privateKey, kpA.publicKey);
  ok(Buffer.from(wa).equals(Buffer.from(wb)), 'ECDH wrap key agrees on both sides');

  // AEAD round trip + tamper + wrong AAD.
  const key = randomBytes(32);
  const aad = new TextEncoder().encode('a|0|3');
  const blob = await aeadEncrypt(key, new TextEncoder().encode('hello'), aad);
  const back = new TextDecoder().decode(await aeadDecrypt(key, blob, aad));
  ok(back === 'hello', 'AEAD round-trips');
  const tampered = blob.slice(); tampered[tampered.length - 1] ^= 1;
  let rej = false; try { await aeadDecrypt(key, tampered, aad); } catch (_) { rej = true; }
  ok(rej, 'AEAD rejects tampered ciphertext');
  let rejAad = false; try { await aeadDecrypt(key, blob, new TextEncoder().encode('a|0|9')); } catch (_) { rejAad = true; }
  ok(rejAad, 'AEAD rejects wrong AAD (bound seq/sender)');
}

// ---- group scheme tests -----------------------------------------------------

async function testGroup() {
  const bus = makeBus();
  const A = bus.attach('A');
  const B = bus.attach('B');
  await A.start(); await B.start(); await bus.pump();

  await A.sendContent({ text: 'hi-from-A-1' }); await bus.pump();
  ok(B._inbox.some((m) => m.text === 'hi-from-A-1'), 'B decrypts A\'s message (2-party)');
  ok(!A._inbox.some((m) => m.text === 'hi-from-A-1'), 'A does not receive its own echo');

  await B.sendContent({ text: 'hi-from-B-1' }); await bus.pump();
  ok(A._inbox.some((m) => m.text === 'hi-from-B-1'), 'A decrypts B\'s message (both directions)');

  // Late joiner C.
  const C = bus.attach('C');
  await C.start(); await bus.pump();
  await A.sendContent({ text: 'after-C-joined' }); await bus.pump();
  ok(B._inbox.some((m) => m.text === 'after-C-joined'), 'B gets post-join message');
  ok(C._inbox.some((m) => m.text === 'after-C-joined'), 'C gets post-join message (3-party)');

  // FORWARD SECRECY ON JOIN: C must not be able to read anything sent before it
  // joined — it only ever received the current chain key.
  ok(!C._inbox.some((m) => m.text === 'hi-from-A-1'), 'FS: C cannot read pre-join message from A');
  ok(!C._inbox.some((m) => m.text === 'hi-from-B-1'), 'FS: C cannot read pre-join message from B');

  // A keeps sending; everyone stays in sync.
  await A.sendContent({ text: 'A-2' }); await A.sendContent({ text: 'A-3' }); await bus.pump();
  ok(B._inbox.filter((m) => /^A-[23]$/.test(m.text || '')).length === 2, 'B stays in sync across multiple messages');
  ok(C._inbox.filter((m) => /^A-[23]$/.test(m.text || '')).length === 2, 'C stays in sync across multiple messages');
}

// Out-of-order delivery must still decrypt (skipped-key cache).
async function testOutOfOrder() {
  // Manual wiring so we can reorder A->B delivery.
  const outA = [];
  const A = new GroupSession({ send: (i) => outA.push(JSON.parse(JSON.stringify(i))), onMessage: () => {}, onError: () => {} });
  const inboxB = [];
  const B = new GroupSession({ send: () => {}, onMessage: (o) => inboxB.push(o), onError: () => {} });
  await A.start(); await B.start();
  // Exchange hello/skd both ways.
  const outB = [];
  B.send = (i) => outB.push(JSON.parse(JSON.stringify(i)));
  await A._announce(); for (const i of outA.splice(0)) await B.handleInner(i);
  for (const i of outB.splice(0)) await A.handleInner(i);
  for (const i of outA.splice(0)) await B.handleInner(i);
  for (const i of outB.splice(0)) await A.handleInner(i);

  await A.sendContent({ text: 'm0' });
  await A.sendContent({ text: 'm1' });
  await A.sendContent({ text: 'm2' });
  const msgs = outA.splice(0).filter((i) => i.k === 'm');
  // Deliver in order 2, 0, 1.
  await B.handleInner(msgs[2]);
  await B.handleInner(msgs[0]);
  await B.handleInner(msgs[1]);
  ok(inboxB.length === 3, 'out-of-order: all 3 messages decrypt');
  ok(['m0', 'm1', 'm2'].every((t) => inboxB.some((m) => m.text === t)), 'out-of-order: contents correct');

  // A tampered ciphertext is dropped, not delivered.
  await A.sendContent({ text: 'm3' });
  const bad = outA.splice(0).find((i) => i.k === 'm');
  bad.ct = bad.ct.slice(0, -2) + (bad.ct.slice(-2) === 'AA' ? 'BB' : 'AA');
  const beforeLen = inboxB.length;
  await B.handleInner(bad);
  ok(inboxB.length === beforeLen, 'tampered message is rejected (not rendered)');
}

async function run() {
  await testPrimitives();
  await testGroup();
  await testOutOfOrder();
  console.log(`\n  forward-secrecy test: ${passed} passed, ${failed} failed\n`);
  process.exit(failed ? 1 : 0);
}

run().catch((e) => { console.error(e); process.exit(1); });
