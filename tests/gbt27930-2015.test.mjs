import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {analyze27930, framesFromClassicAsc} from '../public/can/gbt27930-2015.mjs';

const fixture = readFileSync('tests/fixtures/gbt27930-2015/session-synthetic.asc', 'utf8');

function field(event, name) {
  return event.fields.find(item => item.name === name);
}

function frame(time, id, data, extra = {}) {
  return {time, id, data, extended: true, sourceLine: extra.sourceLine ?? null, ...extra};
}

function id(priority, pf, ps, sa) {
  return ((priority & 7) << 26) | (pf << 16) | (ps << 8) | sa;
}

test('synthetic 2015 session decodes cross-checked messages and keeps raw frames', () => {
  assert.match(fixture, /synthetic/);
  assert.match(fixture, /not a recording from equipment/);
  const parsed = framesFromClassicAsc(fixture);
  const result = analyze27930(parsed.frames);
  assert.equal(result.edition, 'GB/T 27930-2015');
  assert.equal(result.coverage.certification, false);
  const byCode = new Map(result.events.filter(event => event.status === 'decoded').map(event => [event.code, event]));
  assert.equal(field(byCode.get('CHM'), '协议版本').value, '1.1');
  assert.equal(byCode.get('CHM').trace[0].sourceLine, 4);
  assert.equal(byCode.get('CHM').trace[0].id, 0x1826F456);
  assert.deepEqual(byCode.get('CHM').trace[0].raw, [0x01, 0x01, 0x00]);
  assert.equal(field(byCode.get('BHM'), '最高允许充电总电压').value, 500);
  assert.equal(field(byCode.get('CRM'), '辨识结果').value, '成功');
  assert.equal(field(byCode.get('BCP'), '最高允许充电电流').value, 200);
  assert.equal(field(byCode.get('BCP'), '当前电池电压').value, 390);
  assert.equal(byCode.get('BCP').transport, 'BAM');
  assert.equal(byCode.get('BCP').trace.length, 3);
  assert.equal(field(byCode.get('CML'), '最小输出电流').value, 10);
  assert.equal(field(byCode.get('BRO'), '准备状态').value, '完成');
  assert.equal(field(byCode.get('BCL'), '充电模式').value, '恒压');
  assert.equal(field(byCode.get('CCS'), '充电允许').value, '允许');
  assert.equal(field(byCode.get('BSD'), '最低温度').value, 20);
  assert.equal(field(byCode.get('CSD'), '输出能量').value, 12.5);
  const unknown = result.events.find(event => event.status === 'unknown');
  assert.equal(unknown.pgn, 0xff56);
  assert.equal(unknown.fields.length, 0);
  const truncated = result.events.find(event => event.code === 'CHM' && event.status === 'incomplete');
  assert.equal(truncated.fields.length, 0);
  assert.equal(truncated.trace[0].sourceLine, 18);
  assert.ok(result.anomalies.some(item => item.code === 'UNKNOWN' && item.message.includes('未按故障判断')));
  assert.ok(result.anomalies.some(item => item.code === 'CHM' && item.message.includes('未按解码成功')));
  assert.deepEqual(result.stages.slice(0, 4), ['握手', '辨识', '参数配置', '充电']);
});

test('out-of-order input is sorted without dropping the original frame', () => {
  const result = analyze27930([
    frame(0.5, 0x1826F456, [0x01, 0x01, 0x00], {sourceLine: 10}),
    frame(0.1, 0x182756F4, [0x88, 0x13], {sourceLine: 11}),
  ]);
  assert.deepEqual(result.events.map(event => event.sourceLine), [11, 10]);
  assert.ok(result.anomalies.some(item => item.code === 'TIME'));
});

test('unknown, standard, truncated and unsupported transport are not decoded successes', () => {
  const result = analyze27930([
    frame(0, 0x200, [0], {extended: false}),
    frame(0.1, id(7, 0xec, 0x56, 0xf4), [16, 0, 0, 0, 0xff, 0, 0, 0]),
    frame(0.2, id(6, 0x15, 0x56, 0xf4), [1, 2, 3, 4, 5, 6, 7, 8]),
    frame(0.3, id(7, 0xec, 0x56, 0xf4), [32, 13, 0, 2, 0xff, 0, 6, 0]),
  ]);
  assert.equal(result.events.some(event => event.status === 'decoded'), false);
  assert.ok(result.events.some(event => event.status === 'ignored'));
  assert.ok(result.events.some(event => event.code === 'BMV' && event.status === 'identified' && event.fields.length === 0));
  assert.ok(result.events.some(event => event.code === 'BCP' && event.status === 'incomplete' && event.fields.length === 0));
  assert.ok(result.anomalies.some(item => item.code === 'TP-CM'));
  assert.ok(result.anomalies.some(item => item.code === 'TP-BAM'));
});

test('BCL gap uses the stated one-second boundary and does not invent a five-second fault', () => {
  const bcl = (time) => frame(time, 0x181056F4, [0xa0, 0x0f, 0x88, 0x13, 0x02]);
  const exact = analyze27930([bcl(0), bcl(1)]);
  assert.equal(exact.anomalies.some(item => item.code === 'BCL' && item.message.includes('超过')), false);
  const late = analyze27930([bcl(0), bcl(1.001)]);
  assert.ok(late.anomalies.some(item => item.code === 'BCL' && item.message.includes('1000 ms')));
  assert.equal(late.anomalies.some(item => item.message.includes('5000')), false);
});

test('current offset and BRM identification stay inside the cited field rules', () => {
  const zero = analyze27930([frame(0, 0x181056F4, [0, 0, 0, 0, 0x01])]);
  assert.equal(field(zero.events[0], '电流需求').value, -400);
  const brm = [frame(0, id(7, 0xec, 0x56, 0xf4), [32, 49, 0, 7, 0xff, 0, 2, 0])];
  for (let sequence = 1; sequence <= 7; sequence++) brm.push(frame(sequence / 100, id(7, 0xeb, 0x56, 0xf4), [sequence, 0, 0, 0, 0, 0, 0, 0]));
  const identified = analyze27930(brm);
  const event = identified.events.find(item => item.code === 'BRM');
  assert.equal(event.status, 'identified');
  assert.deepEqual(event.fields, []);
  assert.equal(event.trace.length, 8);
});

test('BCS packed cell voltage is decoded only after a complete BAM', () => {
  const frames = [
    frame(0, id(7, 0xec, 0x56, 0xf4), [32, 9, 0, 2, 0xff, 0, 0x11, 0]),
    frame(0.01, id(7, 0xeb, 0x56, 0xf4), [1, 0xa0, 0x0f, 0x88, 0x13, 0x9f, 0x21, 0x37]),
    frame(0.02, id(7, 0xeb, 0x56, 0xf4), [2, 0x14, 0x00, 0xff, 0xff, 0xff, 0xff, 0xff]),
  ];
  const result = analyze27930(frames);
  const event = result.events.find(item => item.code === 'BCS');
  assert.equal(event.status, 'decoded');
  assert.equal(field(event, '最高单体电压').value, 4.15);
  assert.equal(field(event, '最高单体组号').value, 2);
  assert.equal(field(event, '预估剩余充电时间').value, 20);
});

test('catalogued stop and error messages are identified without field values', () => {
  const result = analyze27930([
    frame(0, id(4, 0x19, 0x56, 0xf4), [1, 2, 3, 4]),
    frame(0.1, id(4, 0x19, 0x56, 0xf4), [1, 2]),
  ]);
  assert.equal(result.events[0].code, 'BST');
  assert.equal(result.events[0].status, 'identified');
  assert.deepEqual(result.events[0].fields, []);
  assert.equal(result.events[1].status, 'incomplete');
  assert.equal(result.events.some(event => event.status === 'unknown'), false);
  assert.ok(result.anomalies.some(item => item.code === 'BST' && item.message.includes('字段解码未纳入')));
});

test('a 2015 BAM does not decode data sent elsewhere or data after Abort', () => {
  const bam = frame(0, id(7, 0xec, 0x56, 0xf4), [0x20, 13, 0, 2, 0xff, 0x00, 0x06, 0]);
  const packet = (time, da, sequence, bytes) => frame(time, id(7, 0xeb, da, 0xf4), [sequence, ...bytes]);
  const elsewhere = analyze27930([
    bam,
    packet(0.1, 0x10, 1, [0xa4, 0x01, 0x70, 0x17, 0xf4, 0x01, 0x88]),
    packet(0.2, 0x10, 2, [0x13, 0x5f, 0x20, 0x03, 0x3c, 0x0f, 0xff]),
  ]);
  assert.equal(elsewhere.events.some(event => event.status === 'decoded'), false);
  const aborted = analyze27930([
    bam,
    frame(0.05, id(7, 0xec, 0x56, 0xf4), [0xff, 0xff, 0xff, 0xff, 0xff, 0x00, 0x06, 0]),
    packet(0.1, 0x56, 1, [0xa4, 0x01, 0x70, 0x17, 0xf4, 0x01, 0x88]),
    packet(0.2, 0x56, 2, [0x13, 0x5f, 0x20, 0x03, 0x3c, 0x0f, 0xff]),
  ]);
  assert.equal(aborted.events.some(event => event.status === 'decoded'), false);
  assert.ok(aborted.anomalies.some(item => item.message.includes('Abort')));
});

test('a session without handshake or identification is marked incomplete', () => {
  const result = analyze27930([frame(0, 0x181056F4, [0xa0, 0x0f, 0x88, 0x13, 0x01])]);
  assert.equal(result.events[0].status, 'decoded');
  assert.ok(result.anomalies.some(item => item.code === 'SESSION'));
});
