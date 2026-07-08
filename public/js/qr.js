// qr.js — Minimal, dependency-free QR Code generator (byte mode).
//
// Why this exists: sharing the invite by QR lets the other phone join by
// pointing its normal camera at the screen — the key never touches the
// clipboard, browser history, or a messaging app's link preview (the three
// biggest real-world leak paths). We only need to GENERATE a code; the phone's
// built-in camera does the scanning.
//
// Scope: byte mode, EC level M (good error tolerance for on-screen scanning),
// QR versions 1–10 — far more than a URL needs. Built straight from the
// ISO/IEC 18004 spec so it stays as auditable as the rest of this project.
// No external libraries.

const TE = new TextEncoder();

// ---- Galois field GF(256) for Reed–Solomon ---------------------------------
const EXP = new Uint8Array(512);
const LOG = new Uint8Array(256);
(function initGF() {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    EXP[i] = x;
    LOG[x] = i;
    x = (x << 1) ^ (x & 0x80 ? 0x11d : 0); // primitive poly x^8+x^4+x^3+x^2+1
  }
  for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
})();
const gfMul = (a, b) => (a === 0 || b === 0) ? 0 : EXP[LOG[a] + LOG[b]];

// Generator polynomial for `deg` error-correction codewords (leading coeff 1).
function rsGenPoly(deg) {
  let g = [1];
  for (let i = 0; i < deg; i++) {
    const ng = new Array(g.length + 1).fill(0);
    for (let j = 0; j < g.length; j++) {
      ng[j] ^= g[j];                       // * x
      ng[j + 1] ^= gfMul(g[j], EXP[i]);    // * α^i
    }
    g = ng;
  }
  return g;
}

// Reed–Solomon EC codewords for one data block.
function rsEncode(data, ecCount) {
  const gen = rsGenPoly(ecCount);
  const res = new Array(ecCount).fill(0);
  for (const d of data) {
    const factor = d ^ res[0];
    res.shift();
    res.push(0);
    if (factor !== 0) for (let j = 0; j < ecCount; j++) res[j] ^= gfMul(gen[j + 1], factor);
  }
  return res;
}

// ---- Per-version tables (versions 1..10, EC levels L and M) -----------------
// Each entry: [ecCodewordsPerBlock, [[numBlocks, dataCwPerBlock], ...]]
const ECC = {
  L: [
    [7, [[1, 19]]], [10, [[1, 34]]], [15, [[1, 55]]], [20, [[1, 80]]], [26, [[1, 108]]],
    [18, [[2, 68]]], [20, [[2, 78]]], [24, [[2, 97]]], [30, [[2, 116]]], [18, [[2, 68], [2, 69]]],
  ],
  M: [
    [10, [[1, 16]]], [16, [[1, 28]]], [26, [[1, 44]]], [18, [[2, 32]]], [24, [[2, 43]]],
    [16, [[4, 27]]], [18, [[4, 31]]], [22, [[2, 38], [2, 39]]], [22, [[3, 36], [2, 37]]], [26, [[4, 43], [1, 44]]],
  ],
};
const ECL_FORMAT = { L: 1, M: 0, Q: 3, H: 2 };
// Alignment-pattern centre coordinates by version (empty for v1).
const ALIGN = [
  [], [6, 18], [6, 22], [6, 26], [6, 30], [6, 34],
  [6, 22, 38], [6, 24, 42], [6, 26, 46], [6, 28, 50],
];
// Remainder bits appended after the final codewords, by version.
const REMAINDER = [0, 7, 7, 7, 7, 7, 0, 0, 0, 0];

function blockStructure(version, level) {
  const [ec, groups] = ECC[level][version - 1];
  const blocks = [];
  let totalData = 0;
  for (const [n, cw] of groups) for (let i = 0; i < n; i++) { blocks.push(cw); totalData += cw; }
  return { ec, blocks, totalData };
}

// ---- Bit buffer -------------------------------------------------------------
function makeBits() {
  const bytes = [];
  let len = 0;
  return {
    get length() { return len; },
    bytes,
    pushBit(b) {
      if ((len & 7) === 0) bytes.push(0);
      if (b) bytes[len >> 3] |= 1 << (7 - (len & 7));
      len++;
    },
    push(val, n) { for (let i = n - 1; i >= 0; i--) this.pushBit((val >> i) & 1); },
  };
}

// ---- Data encoding (byte mode) ---------------------------------------------
function chooseVersion(byteLen, level) {
  for (let v = 1; v <= 10; v++) {
    const { totalData } = blockStructure(v, level);
    const countBits = v < 10 ? 8 : 16;
    const need = 4 + countBits + byteLen * 8;
    if (need <= totalData * 8) return v;
  }
  throw new Error('data too large for QR versions 1–10');
}

function encodeCodewords(bytes, version, level) {
  const { totalData } = blockStructure(version, level);
  const bb = makeBits();
  bb.push(0b0100, 4);                          // byte-mode indicator
  bb.push(bytes.length, version < 10 ? 8 : 16); // character count
  for (const b of bytes) bb.push(b, 8);
  const capacity = totalData * 8;
  bb.push(0, Math.min(4, capacity - bb.length)); // terminator
  while (bb.length & 7) bb.pushBit(0);           // byte align
  const pad = [0xec, 0x11];
  for (let i = 0; (bb.length >> 3) < totalData; i++) bb.push(pad[i & 1], 8);
  return bb.bytes.slice(0, totalData);
}

// Split into blocks, add EC, then interleave (data first, then EC).
function interleave(codewords, version, level) {
  const { ec, blocks } = blockStructure(version, level);
  const dataBlocks = [], ecBlocks = [];
  let pos = 0;
  for (const size of blocks) {
    const d = codewords.slice(pos, pos + size); pos += size;
    dataBlocks.push(d);
    ecBlocks.push(rsEncode(d, ec));
  }
  const out = [];
  const maxData = Math.max(...blocks);
  for (let i = 0; i < maxData; i++) for (const b of dataBlocks) if (i < b.length) out.push(b[i]);
  for (let i = 0; i < ec; i++) for (const b of ecBlocks) out.push(b[i]);
  return out;
}

// ---- Matrix assembly --------------------------------------------------------
function makeMatrix(version) {
  const size = version * 4 + 17;
  const mods = Array.from({ length: size }, () => new Int8Array(size).fill(-1));
  const fn = Array.from({ length: size }, () => new Uint8Array(size)); // function module?
  const set = (r, c, v) => { mods[r][c] = v; fn[r][c] = 1; };

  function finder(r, c) {
    for (let dr = -1; dr <= 7; dr++) for (let dc = -1; dc <= 7; dc++) {
      const rr = r + dr, cc = c + dc;
      if (rr < 0 || rr >= size || cc < 0 || cc >= size) continue;
      const inRing = dr >= 0 && dr <= 6 && dc >= 0 && dc <= 6 &&
        (dr === 0 || dr === 6 || dc === 0 || dc === 6 || (dr >= 2 && dr <= 4 && dc >= 2 && dc <= 4));
      set(rr, cc, inRing ? 1 : 0);
    }
  }
  finder(0, 0); finder(0, size - 7); finder(size - 7, 0);

  // Timing patterns
  for (let i = 8; i < size - 8; i++) { set(6, i, i % 2 === 0 ? 1 : 0); set(i, 6, i % 2 === 0 ? 1 : 0); }

  // Alignment patterns
  const coords = ALIGN[version - 1];
  for (const r of coords) for (const c of coords) {
    if ((r <= 7 && c <= 7) || (r <= 7 && c >= size - 8) || (r >= size - 8 && c <= 7)) continue;
    for (let dr = -2; dr <= 2; dr++) for (let dc = -2; dc <= 2; dc++)
      set(r + dr, c + dc, Math.max(Math.abs(dr), Math.abs(dc)) !== 1 ? 1 : 0);
  }

  // Dark module + reserve format/version areas so data skips them.
  set(size - 8, 8, 1);
  for (let i = 0; i <= 8; i++) { if (mods[8][i] < 0) set(8, i, 0); if (mods[i][8] < 0) set(i, 8, 0); }
  for (let i = 0; i < 8; i++) { if (mods[8][size - 1 - i] < 0) set(8, size - 1 - i, 0); if (mods[size - 1 - i][8] < 0) set(size - 1 - i, 8, 0); }
  if (version >= 7) {
    for (let i = 0; i < 18; i++) {
      const a = size - 11 + (i % 3), b = Math.floor(i / 3);
      set(a, b, 0); set(b, a, 0);
    }
  }
  return { size, mods, fn };
}

function placeData(m, bits) {
  const { size, mods, fn } = m;
  let idx = 0, dir = -1, row = size - 1;
  for (let col = size - 1; col > 0; col -= 2) {
    if (col === 6) col--; // skip vertical timing column
    for (;;) {
      for (let j = 0; j < 2; j++) {
        const c = col - j;
        if (!fn[row][c]) {
          mods[row][c] = idx < bits.length ? bits[idx] : 0;
          idx++;
        }
      }
      row += dir;
      if (row < 0 || row >= size) { row -= dir; dir = -dir; break; }
    }
  }
}

const MASK = [
  (r, c) => (r + c) % 2 === 0,
  (r, c) => r % 2 === 0,
  (r, c) => c % 3 === 0,
  (r, c) => (r + c) % 3 === 0,
  (r, c) => (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0,
  (r, c) => ((r * c) % 2) + ((r * c) % 3) === 0,
  (r, c) => (((r * c) % 2) + ((r * c) % 3)) % 2 === 0,
  (r, c) => (((r + c) % 2) + ((r * c) % 3)) % 2 === 0,
];

function applyMask(m, mask) {
  const { size, mods, fn } = m;
  for (let r = 0; r < size; r++) for (let c = 0; c < size; c++)
    if (!fn[r][c] && MASK[mask](r, c)) mods[r][c] ^= 1;
}

// BCH(15,5) format information.
function formatBits(level, mask) {
  const data = (ECL_FORMAT[level] << 3) | mask;
  let d = data << 10;
  for (let i = 14; i >= 10; i--) if (d & (1 << i)) d ^= 0x537 << (i - 10);
  return ((data << 10) | (d & 0x3ff)) ^ 0x5412;
}

function placeFormat(m, level, mask) {
  const { size, mods } = m;
  const bits = formatBits(level, mask);
  const bit = (i) => (bits >> i) & 1;
  // First copy: down the left of the top-right... actually around the top-left
  // finder — vertical strip (col 8) then horizontal strip (row 8).
  for (let i = 0; i <= 5; i++) mods[i][8] = bit(i);
  mods[7][8] = bit(6); mods[8][8] = bit(7); mods[8][7] = bit(8);
  for (let i = 9; i < 15; i++) mods[8][14 - i] = bit(i);
  // Second copy: horizontal strip (row 8, right side) then vertical (col 8, bottom).
  for (let i = 0; i < 8; i++) mods[8][size - 1 - i] = bit(i);
  for (let i = 8; i < 15; i++) mods[size - 15 + i][8] = bit(i);
  mods[size - 8][8] = 1; // always-dark module
}

function placeVersion(m, version) {
  if (version < 7) return;
  const { size, mods } = m;
  let d = version << 12;
  for (let i = 17; i >= 12; i--) if (d & (1 << i)) d ^= 0x1f25 << (i - 12);
  const bits = (version << 12) | (d & 0xfff);
  for (let i = 0; i < 18; i++) {
    const b = (bits >> i) & 1;
    const a = size - 11 + (i % 3), row = Math.floor(i / 3);
    mods[a][row] = b; mods[row][a] = b;
  }
}

// ---- Mask penalty (ISO rules 1–4) ------------------------------------------
function penalty(m) {
  const { size, mods } = m;
  let p = 0;
  // Rule 1: runs of 5+ same-colour in row/column.
  for (let r = 0; r < size; r++) {
    let runC = 1, runR = 1;
    for (let c = 1; c < size; c++) {
      if (mods[r][c] === mods[r][c - 1]) { if (++runC >= 5) p += runC === 5 ? 3 : 1; } else runC = 1;
      if (mods[c][r] === mods[c - 1][r]) { if (++runR >= 5) p += runR === 5 ? 3 : 1; } else runR = 1;
    }
  }
  // Rule 2: 2x2 blocks of same colour.
  for (let r = 0; r < size - 1; r++) for (let c = 0; c < size - 1; c++) {
    const v = mods[r][c];
    if (v === mods[r][c + 1] && v === mods[r + 1][c] && v === mods[r + 1][c + 1]) p += 3;
  }
  // Rule 3: finder-like 1:1:3:1:1 patterns with 4-module light border.
  const pat1 = [1, 0, 1, 1, 1, 0, 1, 0, 0, 0, 0];
  const pat2 = [0, 0, 0, 0, 1, 0, 1, 1, 1, 0, 1];
  for (let r = 0; r < size; r++) for (let c = 0; c <= size - 11; c++) {
    let m1 = true, m2 = true;
    for (let k = 0; k < 11; k++) { if (mods[r][c + k] !== pat1[k]) m1 = false; if (mods[r][c + k] !== pat2[k]) m2 = false; }
    if (m1 || m2) p += 40;
    let n1 = true, n2 = true;
    for (let k = 0; k < 11; k++) { if (mods[c + k][r] !== pat1[k]) n1 = false; if (mods[c + k][r] !== pat2[k]) n2 = false; }
    if (n1 || n2) p += 40;
  }
  // Rule 4: overall dark/light balance.
  let dark = 0;
  for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) if (mods[r][c]) dark++;
  const pct = (dark * 100) / (size * size);
  p += Math.floor(Math.abs(pct - 50) / 5) * 10;
  return p;
}

// ---- Public API -------------------------------------------------------------
// Returns { size, modules } where modules[r][c] is 1 (dark) or 0 (light).
// No quiet zone included — the caller adds margin when rendering.
export function qrMatrix(text, level = 'M') {
  const bytes = TE.encode(text);
  const version = chooseVersion(bytes.length, level);
  const codewords = interleave(encodeCodewords(bytes, version, level), version, level);

  // Codewords -> bit array (+ remainder bits).
  const bits = [];
  for (const cw of codewords) for (let i = 7; i >= 0; i--) bits.push((cw >> i) & 1);
  for (let i = 0; i < REMAINDER[version - 1]; i++) bits.push(0);

  // Try all 8 masks, keep the lowest-penalty result.
  let best = null, bestPen = Infinity;
  for (let mask = 0; mask < 8; mask++) {
    const m = makeMatrix(version);
    placeData(m, bits);
    applyMask(m, mask);
    placeFormat(m, level, mask);
    placeVersion(m, version);
    const pen = penalty(m);
    if (pen < bestPen) { bestPen = pen; best = m; }
  }
  return { size: best.size, modules: best.mods.map((row) => Array.from(row)), version };
}

// Draw a QR onto a <canvas>. Always black-on-white (independent of app theme)
// so any camera can read it. `scale` = pixels per module, `margin` = quiet-zone
// modules (spec requires 4).
export function drawQR(canvas, text, { scale = 6, margin = 4, level = 'M' } = {}) {
  const { size, modules } = qrMatrix(text, level);
  const dim = (size + margin * 2) * scale;
  canvas.width = dim;
  canvas.height = dim;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, dim, dim);
  ctx.fillStyle = '#000000';
  for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) {
    if (modules[r][c]) ctx.fillRect((c + margin) * scale, (r + margin) * scale, scale, scale);
  }
  return { size, version: size };
}
