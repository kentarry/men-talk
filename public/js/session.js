// session.js — Group forward secrecy via "sender keys".
//
// Framework-agnostic: this module knows nothing about the DOM or WebSockets. It
// speaks in plain "inner" message objects and calls back through `send` (to put
// one on the wire) and `onMessage` (a decrypted chat object arrived). app.js
// wraps every inner object in the room-key AES-GCM envelope before sending and
// unwraps before calling handleInner(), so the room link authenticates who may
// take part in the handshake. This lets us unit-test the whole scheme in Node
// (see tools/test-fs.mjs) with no browser.
//
// Scheme (Signal-style "sender keys", adapted to a broadcast relay):
//   * Each member has an EPHEMERAL ECDH key pair for this session only.
//   * `hello`  announces {memberId, ecdhPub}. Members reply so late joiners and
//              reconnectors are discovered.
//   * `skd`    (sender-key distribution) hands one recipient the sender's CURRENT
//              32-byte chain key + baseline seq, wrapped under the pair's ECDH
//              secret. A newcomer thus gets only the current key → cannot read
//              anything sent before it joined (forward secrecy on join).
//   * `m`      a chat message: {from, epoch, seq, ct} where ct is AES-GCM under a
//              per-message key ratcheted from the sender chain. Each message key
//              is used once and dropped → past messages stay unrecoverable even
//              if the current chain key later leaks.
//
// NOT provided (documented honestly in README): continuous post-compromise
// security. A fresh chain is rolled on reconnect (resume()), but not per message
// as a full Double Ratchet / MLS would.

import {
  genECDH, exportPubRaw, importPubRaw, deriveWrapKey, ratchetStep,
  aeadEncrypt, aeadDecrypt, randomBytes, b64urlEncode, b64urlDecode,
} from './crypto.js';

const TE = new TextEncoder();
const TD = new TextDecoder();

const MAX_SKIP = 1000;     // most skipped keys we will ratchet through / cache
const MAX_MEMBERS = 200;   // hard cap on tracked peers
const MAX_BUFFER = 300;    // buffered ciphertexts / skds awaiting prerequisites

export class GroupSession {
  // opts: { send(inner), onMessage(obj, fromId), onError?(msg) }
  constructor(opts) {
    this.send = opts.send;
    this.onMessage = opts.onMessage;
    this.onError = opts.onError || (() => {});
    this.mid = b64urlEncode(randomBytes(9)); // ephemeral member id for this session
    this.kp = null;                          // ECDH key pair
    this.epoch = 0;
    this.sendChain = null;                   // { ck: Uint8Array(32), seq: number }
    this.members = new Map();                // peerId -> { pub, wrapKey }
    this.greeted = new Set();                // peers we have already announced ourselves to
    this.recvChains = new Map();             // `${from}|${epoch}` -> { ck, seq, skipped: Map }
    this.pendingMsg = [];                    // content awaiting a chain key
    this.pendingSkd = [];                    // skd awaiting the sender's pubkey
    this.started = false;
  }

  async start() {
    if (!this.kp) this.kp = await genECDH();
    if (!this.sendChain) this.sendChain = { ck: randomBytes(32), seq: 0 };
    this.started = true;
    await this._announce();
  }

  // Called after a reconnect: roll a fresh chain (new epoch) and re-handshake so
  // seq numbers never collide across a disconnect, and re-share to known peers.
  async resume() {
    if (!this.started) return this.start();
    this.epoch += 1;
    this.sendChain = { ck: randomBytes(32), seq: 0 };
    this.greeted = new Set();
    await this._announce();
    for (const id of this.members.keys()) await this._sendSkd(id);
  }

  async _announce() {
    const epub = b64urlEncode(await exportPubRaw(this.kp.publicKey));
    this.send({ k: 'hello', mid: this.mid, epub });
  }

  // ---- sending ----------------------------------------------------------------

  async sendContent(obj) {
    if (!this.sendChain) this.sendChain = { ck: randomBytes(32), seq: 0 };
    const seq = this.sendChain.seq;
    const { messageKey, nextChainKey } = await ratchetStep(this.sendChain.ck);
    this.sendChain.ck = nextChainKey;   // ratchet forward; previous chain key dropped
    this.sendChain.seq = seq + 1;
    const aad = TE.encode(`${this.mid}|${this.epoch}|${seq}`);
    const ct = b64urlEncode(await aeadEncrypt(messageKey, TE.encode(JSON.stringify(obj)), aad));
    // messageKey goes out of scope here — forward secrecy.
    this.send({ k: 'm', from: this.mid, epoch: this.epoch, seq, ct });
  }

  async _sendSkd(toId) {
    const m = this.members.get(toId);
    if (!m || !this.sendChain) return;
    const payload = TE.encode(JSON.stringify({
      ck: b64urlEncode(this.sendChain.ck), epoch: this.epoch, seq: this.sendChain.seq,
    }));
    const wrap = b64urlEncode(await aeadEncrypt(m.wrapKey, payload));
    this.send({ k: 'skd', from: this.mid, to: toId, wrap });
  }

  // ---- receiving --------------------------------------------------------------

  async handleInner(inner) {
    if (!inner || typeof inner !== 'object') return;
    try {
      if (inner.k === 'hello') return await this._recvHello(inner);
      if (inner.k === 'skd') return await this._recvSkd(inner);
      if (inner.k === 'm') return await this._recvContent(inner);
    } catch (e) {
      this.onError(e && e.message);
    }
  }

  async _recvHello(inner) {
    if (inner.mid === this.mid || typeof inner.epub !== 'string') return;
    if (!this.members.has(inner.mid)) {
      if (this.members.size >= MAX_MEMBERS) return;
      let pub;
      try { pub = await importPubRaw(b64urlDecode(inner.epub)); } catch (_) { return; }
      const wrapKey = await deriveWrapKey(this.kp.privateKey, pub);
      this.members.set(inner.mid, { pub, wrapKey });
      await this._retrySkd(inner.mid); // a skd from them may have arrived early
    }
    // Always hand them our current chain (covers first join AND their reconnect).
    await this._sendSkd(inner.mid);
    // Announce ourselves once per peer so they learn us; guard against loops.
    if (!this.greeted.has(inner.mid)) {
      this.greeted.add(inner.mid);
      await this._announce();
    }
  }

  async _recvSkd(inner) {
    if (inner.to !== this.mid || inner.from === this.mid) return;
    const m = this.members.get(inner.from);
    if (!m) { this._buffer(this.pendingSkd, inner); return; } // don't know their pubkey yet
    let payload;
    try {
      payload = JSON.parse(TD.decode(await aeadDecrypt(m.wrapKey, b64urlDecode(inner.wrap))));
    } catch (_) { return; }
    const key = `${inner.from}|${payload.epoch}`;
    // First skd for an (from,epoch) sets the baseline; ignore later duplicates so
    // an out-of-order re-share can't rewind an already-advanced chain.
    if (!this.recvChains.has(key)) {
      let ck; try { ck = b64urlDecode(payload.ck); } catch (_) { return; }
      this.recvChains.set(key, { ck, seq: payload.seq | 0, skipped: new Map() });
      await this._drainPending();
    }
  }

  async _recvContent(inner) {
    if (inner.from === this.mid) return; // never our own echo
    const key = `${inner.from}|${inner.epoch}`;
    const chain = this.recvChains.get(key);
    if (!chain) { this._buffer(this.pendingMsg, inner); return; } // no key yet -> buffer
    const seq = inner.seq | 0;
    const mk = await this._recvKey(chain, seq);
    if (!mk) return; // too old / skip cap exceeded
    let pt;
    try {
      const aad = TE.encode(`${inner.from}|${inner.epoch}|${seq}`);
      pt = await aeadDecrypt(mk, b64urlDecode(inner.ct), aad);
    } catch (_) { return; } // auth failure -> drop, never render unverified data
    let obj;
    try { obj = JSON.parse(TD.decode(pt)); } catch (_) { return; }
    this.onMessage(obj, inner.from);
  }

  // Derive the message key for `target`, ratcheting/​caching as needed. Returns
  // null if the key is gone (already consumed) or the jump is implausibly large.
  async _recvKey(chain, target) {
    if (target < chain.seq) {
      const mk = chain.skipped.get(target);
      if (mk) { chain.skipped.delete(target); return mk; }
      return null; // already used or pre-baseline (forward secrecy)
    }
    if (target - chain.seq > MAX_SKIP) return null;
    while (chain.seq < target) {
      const step = await ratchetStep(chain.ck);
      chain.skipped.set(chain.seq, step.messageKey);
      if (chain.skipped.size > MAX_SKIP) {
        chain.skipped.delete(chain.skipped.keys().next().value); // evict oldest
      }
      chain.ck = step.nextChainKey;
      chain.seq += 1;
    }
    const step = await ratchetStep(chain.ck);
    chain.ck = step.nextChainKey;
    chain.seq = target + 1;
    return step.messageKey;
  }

  // ---- buffering for out-of-order handshake ----------------------------------

  _buffer(arr, item) {
    arr.push(item);
    if (arr.length > MAX_BUFFER) arr.shift(); // bounded; drop oldest under flood
  }

  async _retrySkd(fromId) {
    const keep = [];
    for (const skd of this.pendingSkd) {
      if (skd.from === fromId) await this._recvSkd(skd);
      else keep.push(skd);
    }
    this.pendingSkd = keep;
  }

  // Re-attempt buffered content now that a new chain may satisfy it.
  async _drainPending() {
    if (!this.pendingMsg.length) return;
    const queue = this.pendingMsg;
    this.pendingMsg = [];
    for (const inner of queue) {
      if (this.recvChains.has(`${inner.from}|${inner.epoch}`)) await this._recvContent(inner);
      else this._buffer(this.pendingMsg, inner);
    }
  }
}
