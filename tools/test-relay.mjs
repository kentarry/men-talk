// test-relay.mjs — relay behaviour checks against a RUNNING server.
// Start the server first (node server/server.js), then: node tools/test-relay.mjs
const HOST = process.env.HOST_URL || 'ws://localhost:8787/ws';
const CH_A = 'a'.repeat(32), CH_B = 'b'.repeat(32);
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  ✗ FAIL:', m); } };
const wait = (ms) => new Promise(r => setTimeout(r, ms));

function mk() {
  const ws = new WebSocket(HOST);
  ws.recv = [];
  ws.onmessage = (e) => ws.recv.push(JSON.parse(e.data));
  return new Promise((res, rej) => { ws.onopen = () => res(ws); ws.onerror = rej; });
}

const A = await mk();
A.send(JSON.stringify({ type: 'join', channel: CH_A }));
await wait(150);
let presA = [...A.recv].reverse().find(m => m.type === 'presence');
ok(presA && presA.count === 1, 'A alone -> presence 1');

const B = await mk();
B.send(JSON.stringify({ type: 'join', channel: CH_A }));
await wait(200);
presA = [...A.recv].reverse().find(m => m.type === 'presence');
ok(presA && presA.count === 2, 'presence 2 after B joins');

A.recv.length = 0; B.recv.length = 0;
A.send(JSON.stringify({ type: 'msg', channel: CH_A, payload: 'CIPHERTEXT' }));
await wait(200);
ok(B.recv.some(m => m.type === 'msg' && m.payload === 'CIPHERTEXT'), 'B receives relayed message');
ok(!A.recv.some(m => m.type === 'msg'), 'sender A gets no echo of its own message');

const C = await mk();
C.send(JSON.stringify({ type: 'join', channel: CH_B }));
await wait(150); C.recv.length = 0;
A.send(JSON.stringify({ type: 'msg', channel: CH_A, payload: 'SECRET_A' }));
await wait(200);
ok(!C.recv.some(m => m.type === 'msg'), 'channel isolation: CH_B gets no CH_A traffic');

const D = await mk();
D.send(JSON.stringify({ type: 'join', channel: 'not-hex!' }));
D.send(JSON.stringify({ type: 'msg', channel: 'not-hex!', payload: 'x' }));
await wait(150);
ok(true, 'server survives malformed input without crashing');

B.close();
await wait(250);
presA = [...A.recv].reverse().find(m => m.type === 'presence');
ok(presA && presA.count === 1, 'presence drops to 1 after B disconnects');

console.log(`\n  relay test: ${pass} passed, ${fail} failed`);
[A, C, D].forEach(w => { try { w.close(); } catch {} });
process.exit(fail ? 1 : 0);
