import assert from 'node:assert/strict';
import test from 'node:test';
import {analyze27930} from '../public/can/gbt27930-2015.mjs';

function frame(time, id, data) {
  return {time, id, data, extended: true, sourceLine: null};
}

function id(priority, pf, ps, sa) {
  return ((priority & 7) << 26) | (pf << 16) | (ps << 8) | sa;
}

function field(event, name) {
  return event.fields.find(item => item.name === name);
}

function hints(result) {
  return result.anomalies.filter(item => item.code === 'HINT').map(item => item.message);
}

function bam(time, payload, pgnMid) {
  const packets = Math.ceil(payload.length / 7);
  const frames = [frame(time, id(7, 0xec, 0x56, 0xf4), [0x20, payload.length & 0xff, (payload.length >> 8) & 0xff, packets, 0xff, 0x00, pgnMid, 0])];
  for (let index = 0; index < packets; index += 1) {
    frames.push(frame(time + (index + 1) / 100, id(7, 0xeb, 0x56, 0xf4), [index + 1, ...payload.slice(index * 7, index * 7 + 7)]));
  }
  return frames;
}

test('BST and CST distinguish a set bit, untrustworthy, fill and an all-zero stop', () => {
  const stop = analyze27930([frame(0, id(4, 0x19, 0x56, 0xf4), [0x40, 0x00, 0x00, 0xf0])]);
  assert.equal(field(stop.events[0], '充电机主动中止').value, '成立');
  assert.equal(field(stop.events[0], '达到SOC目标').value, '未发生');
  assert.equal(field(stop.events[0], '停止说明'), undefined);

  const quiet = analyze27930([frame(0, id(4, 0x19, 0x56, 0xf4), [0x00, 0x00, 0x00, 0xf0])]);
  assert.equal(field(quiet.events[0], '停止说明').value, '停止，未给原因');

  const held = analyze27930([
    frame(0, id(4, 0x19, 0x56, 0xf4), [0x02, 0x00, 0x00, 0xf0]),
    frame(0.1, id(4, 0x19, 0x56, 0xf4), [0x01, 0x00, 0x00, 0xf0]),
    frame(0.2, id(4, 0x19, 0x56, 0xf4), [0x02, 0x00, 0x00, 0xf0]),
    frame(0.3, id(6, 0x26, 0xf4, 0x56), [0x01, 0x01, 0x00]),
    frame(0.4, id(4, 0x19, 0x56, 0xf4), [0x02, 0x00, 0x00, 0xf0]),
  ]);
  assert.equal(field(held.events[0], '达到SOC目标').value, '不可信，无上一状态');
  assert.equal(field(held.events[1], '达到SOC目标').value, '成立');
  assert.equal(field(held.events[2], '达到SOC目标').value, '不可信，保持上一状态：成立');
  assert.equal(field(held.events[4], '达到SOC目标').value, '不可信，无上一状态');

  const filled = analyze27930([frame(0, id(4, 0x19, 0x56, 0xf4), [0x03, 0x00, 0x00, 0xf0])]);
  assert.equal(field(filled.events[0], '达到SOC目标').value, '填充');

  const manual = analyze27930([frame(0, id(4, 0x1a, 0xf4, 0x56), [0x04, 0x00, 0x00, 0xf0])]);
  assert.equal(field(manual.events[0], '人工中止').value, '成立');
  assert.equal(field(manual.events[0], '填充位').value, '不是全 1');

  const noReason = analyze27930([frame(0, id(4, 0x1a, 0xf4, 0x56), [0x00, 0x00, 0xf0, 0xf0])]);
  assert.equal(field(noReason.events[0], '停止说明').value, '停止，未给原因');
  assert.equal(field(noReason.events[0], '填充位'), undefined);

  const cstHold = analyze27930([
    frame(0, id(4, 0x1a, 0xf4, 0x56), [0xfd, 0x00, 0xf0, 0xf0]),
    frame(0.1, id(4, 0x1a, 0xf4, 0x56), [0xfe, 0x00, 0xf0, 0xf0]),
  ]);
  assert.equal(field(cstHold.events[0], '达到充电机设定条件').value, '成立');
  assert.equal(field(cstHold.events[1], '达到充电机设定条件').value, '不可信，保持上一状态：成立');
});

test('BEM and CEM timeout bits keep fill apart from a real timeout', () => {
  const late = analyze27930([
    frame(0, id(6, 0x26, 0xf4, 0x56), [0x01, 0x01, 0x00]),
    frame(70, id(2, 0x1e, 0x56, 0xf4), [0xf1, 0xf0, 0xf0, 0xfc]),
  ]);
  assert.equal(field(late.events[1], '接收CRM(00)超时').value, '成立');
  assert.equal(field(late.events[1], '接收CRM(AA)超时').value, '未发生');
  assert.match(hints(late).join('\n'), /接收CRM\(00\)超时与CHM 间隔 70\.000 s，标准参考 30 s，与标准超时不符/);

  const near = analyze27930([
    frame(0, id(6, 0x26, 0xf4, 0x56), [0x01, 0x01, 0x00]),
    frame(20, id(2, 0x1e, 0x56, 0xf4), [0xf1, 0xf0, 0xf0, 0xfc]),
  ]);
  const nearHint = hints(near).find(item => item.includes('接收CRM(00)超时'));
  assert.match(nearHint, /标准参考 30 s/);
  assert.doesNotMatch(nearHint, /与标准超时不符/);

  const untrustworthy = analyze27930([frame(0, id(2, 0x1e, 0x56, 0xf4), [0xfe, 0xf0, 0xf0, 0xfc])]);
  assert.equal(field(untrustworthy.events[0], '接收CRM(00)超时').value, '不可信，无上一状态');

  const bemFill = analyze27930([frame(0, id(2, 0x1e, 0x56, 0xf4), [0x01, 0xf0, 0xf0, 0xfc])]);
  assert.equal(field(bemFill.events[0], '其他或填充位').value, '未定义，且不是全 1');

  const brmLate = analyze27930([
    frame(0, id(6, 0x01, 0xf4, 0x56), [0x00, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]),
    frame(12, id(2, 0x1f, 0xf4, 0x56), [0xfd, 0xf0, 0xc0, 0xfc]),
  ]);
  assert.equal(brmLate.sessions.length, 2);
  assert.equal(field(brmLate.events.at(-1), '接收BRM超时').value, '成立');
  assert.match(hints(brmLate).join('\n'), /接收BRM超时与CRM 间隔 12\.000 s，标准参考 5 s，与标准超时不符/);

  const brmNear = analyze27930([
    frame(0, id(6, 0x01, 0xf4, 0x56), [0xaa, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]),
    frame(6, id(2, 0x1f, 0xf4, 0x56), [0xfd, 0xf0, 0xc0, 0xfc]),
  ]);
  const brmHint = hints(brmNear).find(item => item.includes('接收BRM超时与CRM'));
  assert.match(brmHint, /6\.000 s，标准参考 5 s/);
  assert.doesNotMatch(brmHint, /与标准超时不符/);

  const bstTimeout = analyze27930([frame(0, id(2, 0x1f, 0xf4, 0x56), [0xfc, 0xf0, 0xd0, 0xfc])]);
  assert.equal(field(bstTimeout.events[0], '接收BST超时').value, '成立');
  assert.match(hints(bstTimeout).join('\n'), /没有可对照的起点/);

  const cemHold = analyze27930([
    frame(0, id(2, 0x1f, 0xf4, 0x56), [0xfd, 0xf0, 0xc0, 0xfc]),
    frame(0.1, id(2, 0x1f, 0xf4, 0x56), [0xfe, 0xf0, 0xc0, 0xfc]),
  ]);
  assert.equal(field(cemHold.events[1], '接收BRM超时').value, '不可信，保持上一状态：成立');
});

test('BSM reports the first abnormality in a handshake and keeps untrustworthy distinct', () => {
  const normal = analyze27930([frame(1, id(6, 0x13, 0x56, 0xf4), [1, 70, 2, 60, 3, 0x20, 0xc0])]);
  assert.equal(field(normal.events[0], '最高单体电压编号').value, 2);
  assert.equal(field(normal.events[0], '最高温度').value, 20);
  assert.equal(field(normal.events[0], '最高温度检测点').value, 3);
  assert.equal(field(normal.events[0], '充电过电流').value, '不可信，无上一状态');
  assert.equal(hints(normal).some(item => item.includes('停止充电')), false);

  const low = analyze27930([frame(1, id(6, 0x13, 0x56, 0xf4), [1, 70, 2, 60, 3, 0x02, 0xc0])]);
  assert.equal(field(low.events[0], '单体电压').value, '过低');
  assert.match(hints(low)[0], /1 s BSM 单体电压过低/);

  const repeated = analyze27930([
    frame(2.5, id(6, 0x13, 0x56, 0xf4), [1, 70, 2, 60, 3, 0x01, 0xc0]),
    frame(2.6, id(6, 0x13, 0x56, 0xf4), [1, 70, 2, 60, 3, 0x01, 0xc0]),
    frame(3, id(6, 0x26, 0xf4, 0x56), [0x01, 0x01, 0x00]),
    frame(3.2, id(6, 0x13, 0x56, 0xf4), [1, 70, 2, 60, 3, 0xc0, 0xc1]),
  ]);
  const stopHints = hints(repeated).filter(item => item.includes('停止充电'));
  assert.equal(stopHints.length, 2);
  assert.match(stopHints[0], /2\.5 s BSM 单体电压过高/);
  assert.match(stopHints[1], /3\.2 s BSM 绝缘状态异常/);
  assert.equal(field(repeated.events[0], '充电允许').value, '禁止');

  const filled = analyze27930([frame(0, id(6, 0x13, 0x56, 0xf4), [0, 50, 0, 50, 0, 0x00, 0xc3])]);
  assert.equal(field(filled.events[0], '绝缘状态').value, '填充');
  assert.equal(hints(filled).some(item => item.includes('停止充电')), false);
});

test('CCS accepts both lengths and remembers the previous allow state', () => {
  const states = analyze27930([
    frame(0, id(6, 0x12, 0xf4, 0x56), [0, 0, 0, 0, 0, 0, 0x01]),
    frame(0.05, id(6, 0x12, 0xf4, 0x56), [0, 0, 0, 0, 0, 0, 0x03]),
    frame(0.1, id(6, 0x12, 0xf4, 0x56), [0, 0, 0, 0, 0, 0, 0x02]),
    frame(0.15, id(6, 0x12, 0xf4, 0x56), [0, 0, 0, 0, 0, 0, 0x00, 0xff]),
  ]);
  assert.equal(field(states.events[0], '充电允许').value, '允许');
  assert.equal(field(states.events[1], '充电允许').value, '填充');
  assert.equal(field(states.events[2], '充电允许').value, '不可信，保持上一状态：允许');
  assert.equal(field(states.events[3], '充电允许').value, '暂停');
  assert.equal(states.events[3].lengthNote, null);
  assert.equal(states.events[3].status, 'decoded');

  const padded = analyze27930([frame(0, id(6, 0x12, 0xf4, 0x56), [0, 0, 0, 0, 0, 0, 0x01, 0xff, 0xff])]);
  assert.equal(padded.events[0].status, 'decoded');
  assert.equal(padded.events[0].lengthNote, '不符合长度要求');
  assert.equal(field(padded.events[0], '充电允许').value, '允许');
});

test('CSD charger number is offset by one and CRM is not', () => {
  const result = analyze27930([
    frame(0, id(6, 0x01, 0xf4, 0x56), [0x00, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]),
    frame(0.1, id(6, 0x1d, 0xf4, 0x56), [0x0f, 0x00, 0x7d, 0x00, 0x01, 0x00, 0x00, 0x00]),
    frame(0.2, id(6, 0x1c, 0x56, 0xf4), [80, 0xe8, 0x03, 0xb0, 0x04, 70, 80]),
  ]);
  assert.equal(field(result.events[0], '充电机编号').value, 1);
  assert.equal(field(result.events[1], '充电机编号').value, 2);
  assert.equal(field(result.events[1], '输出能量').value, 12.5);
  assert.equal(field(result.events[2], '中止荷电状态').value, 80);
  assert.equal(field(result.events[2], '单体最低电压').value, 10);
  assert.equal(field(result.events[2], '单体最高电压').value, 12);
  assert.equal(field(result.events[2], '最低温度').value, 20);
  assert.equal(field(result.events[2], '最高温度').value, 30);
});

test('CTS uses the assumed year byte order and rejects a bad BCD nibble', () => {
  const valid = analyze27930([frame(0, id(6, 0x07, 0xf4, 0x56), [0x15, 0x30, 0x14, 0x24, 0x11, 0x26, 0x20])]);
  assert.equal(field(valid.events[0], '时间同步').value, '2026-11-24 14:30:15');
  assert.match(field(valid.events[0], '时间同步').note, /B6 为后两位、B7 为世纪/);
  const invalid = analyze27930([frame(0, id(6, 0x07, 0xf4, 0x56), [0x1a, 0x30, 0x14, 0x24, 0x11, 0x26, 0x20])]);
  assert.equal(field(invalid.events[0], '时间同步').value, 'BCD 无效');
});

test('BRM shows raw version bytes, hides an all-FF optional region, and accepts both lengths', () => {
  const payload = Array(49).fill(0xff);
  payload[0] = 0x01;
  payload[1] = 0x01;
  payload[2] = 0x00;
  payload[3] = 0x03;
  payload[4] = 0x10;
  payload[5] = 0x27;
  const vin = 'LTESTVIN000000001';
  [...vin].forEach((char, index) => {
    payload[24 + index] = char.charCodeAt(0);
  });
  const decoded = analyze27930(bam(0, payload, 0x02));
  const event = decoded.events.find(item => item.code === 'BRM');
  assert.equal(event.status, 'decoded');
  assert.match(field(event, '协议版本').value, /01 01 00（字节与 V1\.1 示例相同/);
  assert.equal(field(event, '电池类型').value, '磷酸铁锂');
  assert.equal(field(event, '额定容量').value, 1000);
  assert.equal(field(event, '电池生产厂商'), undefined);
  assert.equal(field(event, '车辆识别码').value, vin);
  assert.equal(field(event, '车辆识别码').sensitive, true);
  assert.match(field(event, '车辆识别码').note, /不上传/);
  assert.equal(decoded.anomalies.some(item => item.message.includes(vin)), false);

  const short = analyze27930(bam(0, payload.slice(0, 41), 0x02));
  const shortEvent = short.events.find(item => item.code === 'BRM');
  assert.equal(shortEvent.status, 'decoded');
  assert.equal(shortEvent.lengthNote, null);
  assert.equal(field(shortEvent, 'BMS软件版本'), undefined);

  const missing = analyze27930(bam(0, payload.slice(0, 40), 0x02));
  assert.equal(missing.events.find(item => item.code === 'BRM').status, 'incomplete');

  const padded = analyze27930(bam(0, [...payload.slice(0, 49), 0xff], 0x02));
  const paddedEvent = padded.events.find(item => item.code === 'BRM');
  assert.equal(paddedEvent.status, 'decoded');
  assert.equal(paddedEvent.lengthNote, '不符合长度要求');
  assert.equal(paddedEvent.raw.length, 49);
});

test('BCS current is marked inconsistent only past the documented analysis threshold', () => {
  const bcs = (time, current) => bam(time, [0, 0, current[0], current[1], 0, 0, 0, 0, 0], 0x11);
  const inconsistent = analyze27930([
    frame(0.5, id(6, 0x08, 0xf4, 0x56), [0, 0, 0, 0, 0x80, 0x0c, 0, 0]),
    frame(1, id(6, 0x10, 0x56, 0xf4), [0, 0, 0xb8, 0x0b, 0x02]),
    frame(1.05, id(6, 0x12, 0xf4, 0x56), [0, 0, 0xb8, 0x0b, 0, 0, 0x01]),
    ...bcs(1.1, [0xc4, 0x09]),
  ]);
  const measured = inconsistent.events.find(item => item.code === 'BCS');
  assert.match(field(measured, '充电电流测量值').note, /数据不一致/);
  const text = hints(inconsistent).join('\n');
  assert.match(text, /大于 BCL 需求 100 A/);
  assert.match(text, /大于 CML 最大输出 80 A/);
  assert.match(text, /与同期 CCS 相差 50 A/);
  assert.match(text, /不是故障结论/);

  const consistent = analyze27930([
    frame(0.5, id(6, 0x08, 0xf4, 0x56), [0, 0, 0, 0, 0xd0, 0x07, 0, 0]),
    frame(1, id(6, 0x10, 0x56, 0xf4), [0, 0, 0xd0, 0x07, 0x02]),
    frame(1.05, id(6, 0x12, 0xf4, 0x56), [0, 0, 0x86, 0x0b, 0, 0, 0x01]),
    ...bcs(1.1, [0xb8, 0x0b]),
  ]);
  assert.equal(hints(consistent).some(item => item.includes('数据不一致')), false);
});

test('a non-56/F4 frame is listed without a 2015 field conclusion', () => {
  const result = analyze27930([frame(0, id(4, 0x19, 0x56, 0xe5), [0x40, 0x00, 0x00, 0xf0])]);
  assert.equal(result.events[0].status, 'noted');
  assert.equal(result.events[0].foreign, true);
  assert.deepEqual(result.events[0].fields, []);
  assert.equal(result.foreign.length, 1);
  assert.equal(result.sessions.length, 0);
  assert.match(result.anomalies[0].message, /不按 2015 字段布局下结论/);
  assert.equal(result.events[0].fields.some(item => item.name === '充电机主动中止'), false);
});

test('priority mismatch is noted and a fifth handshake is only a hint', () => {
  const mismatched = analyze27930([frame(0, id(6, 0x19, 0x56, 0xf4), [0x40, 0x00, 0x00, 0xf0])]);
  assert.equal(mismatched.events[0].status, 'decoded');
  assert.match(mismatched.anomalies.find(item => item.code === 'BST').message, /优先级 6 与报文格式所述 4 不一致，仍按字段解码/);

  const four = analyze27930([0, 1, 2, 3].map(time => frame(time, id(6, 0x26, 0xf4, 0x56), [0x01, 0x01, 0x00])));
  assert.equal(hints(four).some(item => item.includes('握手出现')), false);
  const five = analyze27930([0, 1, 2, 3, 4].map(time => frame(time, id(6, 0x26, 0xf4, 0x56), [0x01, 0x01, 0x00])));
  assert.match(hints(five).join('\n'), /握手出现 5 次/);
});
