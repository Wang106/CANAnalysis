import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {analyzeJ1939, parseJ1939Id, readClassicAsc} from '../public/can/j1939.mjs';

const fixture = readFileSync('tests/fixtures/j1939/session-synthetic.asc', 'utf8');
const source = readFileSync('public/can/j1939.mjs', 'utf8');

function id(priority, pf, ps, sa) {
  return ((priority & 7) << 26) | (pf << 16) | (ps << 8) | sa;
}

function frame(time, canId, data, extra = {}) {
  return {time, id: canId, data, extended: true, sourceLine: extra.sourceLine ?? null, ...extra};
}

test('29-bit PDU1 and PDU2 PGNs keep the raw identifier fields', () => {
  const global = parseJ1939Id(0x18efff01);
  assert.equal(global.format, 'PDU1');
  assert.equal(global.priority, 6);
  assert.equal(global.destination, 0xff);
  assert.equal(global.pgn, 0xef00);
  assert.equal(global.sa, 0x01);
  const peer = parseJ1939Id(id(6, 0xef, 0x22, 0x01));
  assert.equal(peer.pgn, 0xef00);
  assert.equal(peer.destination, 0x22);
  const group = parseJ1939Id(0x1cf0aa01);
  assert.equal(group.format, 'PDU2');
  assert.equal(group.pgn, 0xf0aa);
  assert.equal(group.groupExtension, 0xaa);
  assert.equal(group.destination, null);
  const reserved = parseJ1939Id(0x1aefff01);
  assert.equal(reserved.reserved, 1);
  assert.equal(reserved.pgn, 0x2ef00);
  assert.equal(parseJ1939Id(0x1826f456).pgn, 0x2600);
  assert.equal(parseJ1939Id(0x1cec56f4).pgn, 0xec00);
});

test('synthetic fixture reassembles an out-of-order BAM and keeps frame origin', () => {
  assert.match(fixture, /synthetic/);
  assert.match(fixture, /not a recording from equipment/);
  const parsed = readClassicAsc(fixture);
  assert.deepEqual(parsed.fdLines, [10]);
  const result = analyzeJ1939(parsed.frames, {fdLines: parsed.fdLines});
  assert.equal(result.coverage.database, false);
  const pdu1 = result.events.find(event => event.pgn === 0xef00);
  assert.equal(pdu1.destination, 0xff);
  assert.equal(pdu1.trace[0].sourceLine, 4);
  assert.deepEqual(pdu1.raw, [0x11, 0x22, 0x33, 0x44, 0x55, 0x66, 0x77, 0x88]);
  const assembled = result.events.find(event => event.status === 'reassembled');
  assert.equal(assembled.pgn, 0xf0aa);
  assert.equal(assembled.transport, 'BAM');
  assert.deepEqual(assembled.raw, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  assert.deepEqual(assembled.trace.map(item => item.sourceLine), [6, 7, 8]);
  assert.equal(result.events.some(event => event.status === 'ignored'), true);
  assert.ok(result.anomalies.some(item => item.code === 'FD'));
  assert.ok(result.anomalies.some(item => item.code === 'STANDARD' && item.message.includes('未按故障判断')));
  assert.equal(result.events.filter(event => event.status === 'reassembled').length, 1);
});

test('BAM boundaries reject truncation, duplicates, bad lengths and mixed sessions', () => {
  const bam = (sa, da, pgnLow, pgnMid, size, packets) => frame(0, id(7, 0xec, da, sa), [0x20, size, 0, packets, 0xff, pgnLow, pgnMid, 0]);
  const dt = (time, sa, da, sequence, bytes) => frame(time, id(7, 0xeb, da, sa), [sequence, ...bytes]);
  const truncated = analyzeJ1939([
    bam(1, 0xff, 0xaa, 0xf0, 10, 2),
    dt(0.1, 1, 0xff, 1, [1, 2, 3, 4, 5, 6, 7]),
  ]);
  assert.equal(truncated.events.some(event => event.status === 'reassembled'), false);
  assert.ok(truncated.anomalies.some(item => item.code === 'TP-BAM'));
  const duplicate = analyzeJ1939([
    bam(1, 0xff, 0xaa, 0xf0, 10, 2),
    dt(0.1, 1, 0xff, 1, [1, 2, 3, 4, 5, 6, 7]),
    dt(0.2, 1, 0xff, 1, [9, 9, 9, 9, 9, 9, 9]),
    dt(0.3, 1, 0xff, 2, [8, 9, 10, 0xff, 0xff, 0xff, 0xff]),
  ]);
  assert.deepEqual(duplicate.events.find(event => event.status === 'reassembled').raw, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  assert.ok(duplicate.anomalies.some(item => item.code === 'TP-DUP'));
  const badLength = analyzeJ1939([bam(1, 0xff, 0xaa, 0xf0, 10, 1), dt(0.1, 1, 0xff, 1, [1, 2, 3, 4, 5, 6, 7])]);
  assert.equal(badLength.events.some(event => event.status === 'reassembled'), false);
  assert.ok(badLength.anomalies.some(item => item.code === 'TP-LEN'));
  const concurrent = analyzeJ1939([
    bam(1, 0xff, 0xaa, 0xf0, 8, 2),
    bam(1, 0x22, 0x00, 0xef, 8, 2),
    dt(0.1, 1, 0x22, 1, [8, 7, 6, 5, 4, 3, 2]),
    dt(0.2, 1, 0xff, 1, [1, 2, 3, 4, 5, 6, 7]),
    dt(0.3, 1, 0x22, 2, [1, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff]),
    dt(0.4, 1, 0xff, 2, [8, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff]),
  ]);
  const payloads = concurrent.events.filter(event => event.status === 'reassembled').map(event => event.raw.join(','));
  assert.deepEqual(payloads.sort(), ['1,2,3,4,5,6,7,8', '8,7,6,5,4,3,2,1']);
});

test('RTS data already in a log is observed passively and ETP is not reassembled', () => {
  assert.doesNotMatch(source, /export function (send|transmit)/);
  const result = analyzeJ1939([
    frame(0, id(7, 0xec, 0x22, 0x01), [0x10, 10, 0, 2, 2, 0xaa, 0xf0, 0]),
    frame(0.1, id(7, 0xec, 0x01, 0x22), [0x11, 2, 1, 0xff, 0xff, 0xaa, 0xf0, 0]),
    frame(0.2, id(7, 0xeb, 0x22, 0x01), [2, 8, 9, 10, 0xff, 0xff, 0xff, 0xff]),
    frame(0.3, id(7, 0xeb, 0x22, 0x01), [1, 1, 2, 3, 4, 5, 6, 7]),
    frame(0.4, id(7, 0xec, 0x22, 0x05), [0x14, 0, 0, 0, 0, 0, 0, 0]),
  ]);
  const assembled = result.events.find(event => event.status === 'reassembled');
  assert.equal(assembled.transport, 'RTS');
  assert.deepEqual(assembled.raw, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  assert.ok(result.anomalies.some(item => item.code === 'TP-OBSERVE' && item.message.includes('不发送 CTS')));
  assert.ok(result.anomalies.some(item => item.code === 'TP-RTS' && item.message.includes('不表示传输握手已经完成')));
  assert.equal(result.events.some(event => event.transport === 'ETP'), false);
  assert.ok(result.anomalies.some(item => item.code === 'ETP'));
});

test('a short non-final packet, a replaced session and a foreign destination are not successes', () => {
  const bam = (time, da, pgnLow, pgnMid) => frame(time, id(7, 0xec, da, 1), [0x20, 8, 0, 2, 0xff, pgnLow, pgnMid, 0]);
  const dt = (time, da, sequence, bytes) => frame(time, id(7, 0xeb, da, 1), [sequence, ...bytes]);
  const short = analyzeJ1939([
    frame(0, id(7, 0xec, 0xff, 1), [0x20, 10, 0, 2, 0xff, 0xaa, 0xf0, 0]),
    dt(0.1, 0xff, 1, [1, 2, 3]),
    dt(0.2, 0xff, 2, [4, 5, 6, 7, 8, 9, 10]),
  ]);
  assert.equal(short.events.some(event => event.status === 'reassembled'), false);
  assert.ok(short.anomalies.some(item => item.code === 'TP-LEN' && item.message.includes('不是末包')));
  const replaced = analyzeJ1939([
    bam(0, 0xff, 0xaa, 0xf0),
    dt(0.1, 0xff, 1, [1, 2, 3, 4, 5, 6, 7]),
    bam(0.2, 0xff, 0x00, 0xef),
    dt(0.3, 0xff, 1, [8, 7, 6, 5, 4, 3, 2]),
    dt(0.4, 0xff, 2, [1, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff]),
  ]);
  assert.equal(replaced.events.filter(event => event.status === 'reassembled').length, 1);
  assert.deepEqual(replaced.events.find(event => event.status === 'reassembled').raw, [8, 7, 6, 5, 4, 3, 2, 1]);
  assert.equal(replaced.events.find(event => event.status === 'incomplete').pgn, 0xf0aa);
  const foreign = analyzeJ1939([
    bam(0, 0xff, 0xaa, 0xf0),
    dt(0.1, 0x22, 1, [9, 9, 9, 9, 9, 9, 9]),
    dt(0.2, 0x22, 2, [9, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff]),
  ]);
  assert.equal(foreign.events.some(event => event.status === 'reassembled'), false);
});

test('a long classic frame is not treated as J1939-22', () => {
  const result = analyzeJ1939([frame(0, id(6, 0xf0, 0xaa, 1), [1, 2, 3, 4, 5, 6, 7, 8, 9])]);
  assert.equal(result.events[0].status, 'unsupported');
  assert.ok(result.anomalies.some(item => item.code === 'FD' && item.message.includes('J1939-22')));
});
