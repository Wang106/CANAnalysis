// Field layout written from a checked reading of GB/T 27930-2015 message tables.
// The standard text is not copied here. Bit 1 is treated as the least significant
// bit, which the standard text does not state; that choice follows J1939 practice.

const GENERIC = {0: '未发生', 1: '成立', 2: '不可信', 3: '填充'};

function pair(value, bit) {
  return (value >>> (bit - 1)) & 0b11;
}

function fillOk(value, fromBit, toBit) {
  for (let bit = fromBit; bit <= toBit; bit += 1) {
    if (((value >>> (bit - 1)) & 1) !== 1) return false;
  }
  return true;
}

function statusField(memory, key, code, name, labels = GENERIC) {
  const shown = labels[code] ?? '未知';
  // 10 means "untrustworthy" unless this field redefines it (cell voltage and SOC use 10 for 过低).
  if (code === 2 && labels[2] === '不可信') {
    const previous = memory.get(key);
    return {name, value: previous == null ? '不可信，无上一状态' : `不可信，保持上一状态：${previous}`, raw: code};
  }
  if (code === 0 || code === 1 || code === 2) memory.set(key, shown);
  return {name, value: shown, raw: code, ...(labels.abnormal?.(code) ? {abnormal: true} : {})};
}

function pairs(memory, scope, value, specs) {
  return specs.map(([bit, name, labels]) => statusField(memory, `${scope}:${name}`, pair(value, bit), name, labels));
}

function ascii(data, start, length) {
  const slice = data.slice(start, start + length);
  if (slice.length < length || slice.every(byte => byte === 0xff)) return null;
  return slice.map(byte => (byte >= 32 && byte < 127 ? String.fromCharCode(byte) : '.')).join('');
}

function bcd(byte) {
  const high = byte >> 4;
  const low = byte & 0x0f;
  if (high > 9 || low > 9) return null;
  return high * 10 + low;
}

const BATTERY = {
  0x01: '铅酸',
  0x02: '镍氢',
  0x03: '磷酸铁锂',
  0x04: '锰酸锂',
  0x05: '钴酸锂',
  0x06: '三元',
  0x07: '聚合物锂离子',
  0x08: '钛酸锂',
  0xff: '其他',
};

function stopSummary(fields) {
  const reasons = fields.filter(field => field.raw != null && field.name !== '填充位');
  if (reasons.length && reasons.every(field => field.raw === 0)) {
    fields.push({name: '停止说明', value: '停止，未给原因'});
  }
}

export function decodeFields(message, data, memory = new Map()) {
  const code = message.code;
  if (code === 'CHM') {
    const bytes = data.slice(0, 3).map(byte => byte.toString(16).padStart(2, '0')).join(' ');
    const example = data[0] === 0x01 && data[1] === 0x01 && data[2] === 0x00;
    return [{name: '协议版本', value: example ? `${bytes}（字节与 V1.1 示例相同，主次分配未确定）` : `${bytes}（版本号字节分配未确定）`, raw: [...data.slice(0, 3)]}];
  }
  if (code === 'BST') {
    const word = data[1] | (data[2] << 8);
    const fields = [
      ...pairs(memory, code, data[0], [[1, '达到SOC目标'], [3, '达到总电压设定'], [5, '达到单体电压设定'], [7, '充电机主动中止']]),
      ...pairs(memory, code, word, [[1, '绝缘故障'], [3, '输出连接器过温'], [5, 'BMS元件或输出连接器过温'], [7, '充电连接器故障'], [9, '电池组温度过高'], [11, '高压继电器故障'], [13, '检测点2电压检测故障'], [15, '其他故障']]),
      ...pairs(memory, code, data[3], [[1, '电流过大'], [3, '电压异常']]),
    ];
    if (!fillOk(data[3], 5, 8)) fields.push({name: '填充位', value: '不是全 1'});
    stopSummary(fields);
    return fields;
  }
  if (code === 'CST') {
    const word = data[1] | (data[2] << 8);
    const fields = [
      ...pairs(memory, code, data[0], [[1, '达到充电机设定条件'], [3, '人工中止'], [5, '故障中止'], [7, 'BMS主动中止']]),
      ...pairs(memory, code, word, [[1, '充电机过温'], [3, '充电连接器故障'], [5, '充电机内部过温'], [7, '所需电量不能传送'], [9, '充电机急停'], [11, '其他故障']]),
      ...pairs(memory, code, data[3], [[1, '电流不匹配'], [3, '电压异常']]),
    ];
    if (!fillOk(word, 13, 16) || !fillOk(data[3], 5, 8)) fields.push({name: '填充位', value: '不是全 1'});
    stopSummary(fields);
    return fields;
  }
  if (code === 'BEM') {
    const fields = [
      ...pairs(memory, code, data[0], [[1, '接收CRM(00)超时'], [3, '接收CRM(AA)超时']]),
      ...pairs(memory, code, data[1], [[1, '接收CTS和CML超时'], [3, '接收CRO超时']]),
      ...pairs(memory, code, data[2], [[1, '接收CCS超时'], [3, '接收CST超时']]),
      ...pairs(memory, code, data[3], [[1, '接收CSD超时']]),
    ];
    if (!fillOk(data[0], 5, 8) || !fillOk(data[1], 5, 8) || !fillOk(data[2], 5, 8) || !fillOk(data[3], 3, 8)) {
      fields.push({name: '其他或填充位', value: '未定义，且不是全 1'});
    }
    return fields;
  }
  if (code === 'CEM') {
    const fields = [
      ...pairs(memory, code, data[0], [[1, '接收BRM超时']]),
      ...pairs(memory, code, data[1], [[1, '接收BCP超时'], [3, '接收BRO超时']]),
      ...pairs(memory, code, data[2], [[1, '接收BCS超时'], [3, '接收BCL超时'], [5, '接收BST超时']]),
      ...pairs(memory, code, data[3], [[1, '接收BSD超时']]),
    ];
    if (!fillOk(data[0], 3, 8) || !fillOk(data[1], 5, 8) || !fillOk(data[2], 7, 8) || !fillOk(data[3], 3, 8)) {
      fields.push({name: '其他或填充位', value: '未定义，且不是全 1'});
    }
    return fields;
  }
  if (code === 'BSM') {
    const voltage = {0: '正常', 1: '过高', 2: '过低', 3: '填充', abnormal: value => value === 1 || value === 2};
    const soc = {0: '正常', 1: '过高', 2: '过低', 3: '填充', abnormal: value => value === 1 || value === 2};
    const fault = {0: '正常', 1: '异常', 2: '不可信', 3: '填充', abnormal: value => value === 1};
    const allow = {0: '禁止', 1: '允许', 2: '不可信', 3: '填充'};
    const fields = [
      {name: '最高单体电压编号', value: data[0] + 1},
      {name: '最高温度', value: data[1] - 50, unit: '℃'},
      {name: '最高温度检测点', value: data[2] + 1},
      {name: '最低温度', value: data[3] - 50, unit: '℃'},
      {name: '最低温度检测点', value: data[4] + 1},
      ...pairs(memory, code, data[5], [[1, '单体电压', voltage], [3, '荷电状态', soc], [5, '充电过电流', fault], [7, '电池温度过高', fault]]),
      ...pairs(memory, code, data[6], [[1, '绝缘状态', fault], [3, '输出连接器连接状态', fault], [5, '充电允许', allow]]),
    ];
    if (!fillOk(data[6], 7, 8)) fields.push({name: '填充位', value: '不是全 1'});
    return fields;
  }
  if (code === 'CCS') {
    const allow = {0: '暂停', 1: '允许', 2: '不可信', 3: '填充'};
    return [
      {name: '电压输出值', value: scaled(data, 0, 2, 0.1, 0), unit: 'V'},
      {name: '电流输出值', value: scaled(data, 2, 2, 0.1, -400), unit: 'A'},
      {name: '累计充电时间', value: u16(data, 4), unit: 'min'},
      statusField(memory, `${code}:充电允许`, pair(data[6], 1), '充电允许', allow),
    ];
  }
  if (code === 'CTS') {
    const second = bcd(data[0]);
    const minute = bcd(data[1]);
    const hour = bcd(data[2]);
    const day = bcd(data[3]);
    const month = bcd(data[4]);
    const yearLow = bcd(data[5]);
    const century = bcd(data[6]);
    const known = [second, minute, hour, day, month, yearLow, century].every(item => item != null);
    const value = known
      ? `${century}${String(yearLow).padStart(2, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')} ${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:${String(second).padStart(2, '0')}`
      : 'BCD 无效';
    return [{name: '时间同步', value, ...(known ? {note: '年的字节顺序按 B6 为后两位、B7 为世纪；标准未写先后'} : {})}];
  }
  if (code === 'BRM') {
    const version = data.slice(0, 3);
    const versionText = version.map(byte => byte.toString(16).padStart(2, '0')).join(' ');
    const example = version[0] === 0x01 && version[1] === 0x01 && version[2] === 0x00;
    const fields = [
      {name: '协议版本', value: example ? `${versionText}（字节与 V1.1 示例相同，主次分配未确定）` : `${versionText}（版本号字节分配未确定）`},
      {name: '电池类型', value: BATTERY[data[3]] ?? `未知(${data[3].toString(16)})`, raw: data[3]},
      {name: '额定容量', value: scaled(data, 4, 2, 0.1, 0), unit: 'Ah'},
      {name: '额定总电压', value: scaled(data, 6, 2, 0.1, 0), unit: 'V'},
    ];
    const maker = ascii(data, 8, 4);
    if (maker) fields.push({name: '电池生产厂商', value: maker});
    if (data.length >= 16 && !data.slice(12, 16).every(byte => byte === 0xff)) fields.push({name: '电池组序号', value: scaled(data, 12, 4, 1, 0)});
    if (data.length >= 19 && !data.slice(16, 19).every(byte => byte === 0xff)) {
      fields.push({name: '电池组生产日期', value: `${1985 + data[16]}-${data[17]}-${data[18]}`});
    }
    if (data.length >= 22 && !data.slice(19, 22).every(byte => byte === 0xff)) fields.push({name: '电池组充电次数', value: data[19] | (data[20] << 8) | (data[21] << 16)});
    if (data.length >= 23 && data[22] !== 0xff) fields.push({name: '电池组产权', value: data[22] === 0 ? '租赁' : data[22] === 1 ? '车自有' : '未知', raw: data[22]});
    if (data.length >= 24 && data[23] !== 0xff) fields.push({name: '预留', value: data[23], note: '该字节为预留'});
    const vin = ascii(data, 24, 17);
    if (vin) fields.push({name: '车辆识别码', value: vin, note: '仅在当前页面显示，不上传', sensitive: true});
    if (data.length >= 49 && !data.slice(41, 49).every(byte => byte === 0xff)) {
      const year = data[44] | (data[45] << 8);
      const reserved = data.slice(46, 49);
      const reservedText = reserved.every(byte => byte === 0xff) ? '' : ` 预留 ${reserved.map(byte => byte.toString(16).padStart(2, '0')).join(' ')}`;
      fields.push({name: 'BMS软件版本', value: `流水号${data[41]} ${year}-${data[43]}-${data[42]}${reservedText}`});
    }
    return fields;
  }
  return null;
}

function u16(data, offset) {
  return data[offset] | (data[offset + 1] << 8);
}

function scaled(data, offset, length, scale, bias) {
  let raw = 0;
  for (let index = 0; index < length; index += 1) raw += data[offset + index] * (256 ** index);
  const value = raw * scale + bias;
  if (scale >= 1) return value;
  const places = Math.round(-Math.log10(scale));
  return Number(value.toFixed(places));
}

// "远大于" is not defined in the collated notes. This pass uses "more than twice".
const MUCH_LARGER = 2;
// Current disagreement threshold is an analysis choice, not a number from the standard.
const CURRENT_FLOOR_A = 10;
const CURRENT_FRACTION = 0.2;

function tagHandshakes(events) {
  let id = 0;
  let seen = false;
  for (const event of events) {
    if (event.foreign || !event.code || (event.sa != null && event.sa !== 0x56 && event.sa !== 0xf4)) continue;
    if (event.code === 'CHM' && seen) id += 1;
    event.handshakeIndex = id;
    seen = true;
  }
}

function hint(anomalies, event, message) {
  anomalies.push({time: event?.time ?? null, sourceIndex: event?.sourceIndex ?? null, code: 'HINT', message});
}

function fieldByName(event, name) {
  return event.fields.find(item => item.name === name);
}

function absAmp(event, name) {
  const item = fieldByName(event, name);
  return item && typeof item.value === 'number' ? Math.abs(item.value) : null;
}

function inHandshake(events, handshake, time = Infinity) {
  return events.filter(event => event.status === 'decoded' && event.handshakeIndex === handshake && event.time <= time);
}

function decoded(events, code, handshake, time = Infinity) {
  return inHandshake(events, handshake, time).filter(event => event.code === code);
}

function hintCurrents(events, anomalies) {
  for (const event of events) {
    if (event.code !== 'BCS' || event.status !== 'decoded') continue;
    const measured = absAmp(event, '充电电流测量值');
    if (measured == null) continue;
    const reasons = [];
    const demand = decoded(events, 'BCL', event.handshakeIndex, event.time).at(-1);
    const demandAmp = demand ? absAmp(demand, '电流需求') : null;
    if (demandAmp != null && measured > demandAmp) reasons.push(`绝对值 ${measured} A 大于 BCL 需求 ${demandAmp} A`);
    const limit = decoded(events, 'CML', event.handshakeIndex, event.time).at(-1);
    const limitAmp = limit ? absAmp(limit, '最大输出电流') : null;
    if (limitAmp != null && measured > limitAmp) reasons.push(`绝对值 ${measured} A 大于 CML 最大输出 ${limitAmp} A`);
    const outputs = events.filter(item => item.code === 'CCS' && item.status === 'decoded' && item.handshakeIndex === event.handshakeIndex && Math.abs(item.time - event.time) <= 1);
    const output = outputs.sort((left, right) => Math.abs(left.time - event.time) - Math.abs(right.time - event.time))[0];
    const outputAmp = output ? absAmp(output, '电流输出值') : null;
    if (outputAmp != null) {
      const diff = Math.abs(measured - outputAmp);
      const threshold = Math.max(CURRENT_FLOOR_A, CURRENT_FRACTION * Math.max(measured, outputAmp));
      if (diff > threshold) reasons.push(`与同期 CCS 相差 ${diff} A，超过分析用阈值 ${threshold} A`);
    }
    if (!reasons.length) continue;
    const current = fieldByName(event, '充电电流测量值');
    if (current) current.note = [current.note, '数据不一致'].filter(Boolean).join('；');
    hint(anomalies, event, `提示：BCS 充电电流${reasons.join('；')}。数据不一致。阈值取 max(${CURRENT_FLOOR_A} A, 较大绝对值的 ${CURRENT_FRACTION * 100}%)，不是标准限值。这只是对照，不是故障结论`);
  }
}

function hintBsm(events, anomalies) {
  const seen = new Set();
  for (const event of events) {
    if (event.code !== 'BSM' || event.status !== 'decoded' || seen.has(event.handshakeIndex)) continue;
    const abnormal = event.fields.filter(item => item.abnormal);
    if (!abnormal.length) continue;
    seen.add(event.handshakeIndex);
    const names = abnormal.map(item => `${item.name}${item.value}`).join('、');
    hint(anomalies, event, `提示：${event.time} s BSM ${names} 首次异常。标准要求此时充电机停止充电。这只是时间点提示，不是本工具作出的停止结论`);
  }
}

function compareTimeout(anomalies, event, label, start, limit) {
  if (!start) {
    hint(anomalies, event, `提示：${event.code} 报${label}，这次握手里没有可对照的起点，不下结论`);
    return;
  }
  const gap = event.time - start.time;
  const mismatch = gap > limit * MUCH_LARGER;
  hint(anomalies, event, `提示：${event.code} ${label}与${start.code} 间隔 ${gap.toFixed(3)} s，标准参考 ${limit} s${mismatch ? '，与标准超时不符' : ''}。只作时间线提示，不是故障结论`);
}

function timeoutBits(events, anomalies) {
  const cem = [
    ['接收BRM超时', 5, (list) => list.filter(item => item.code === 'CRM').at(0)],
    ['接收BCP超时', 5, (list) => list.filter(item => item.code === 'BRM').at(0) || list.filter(item => item.code === 'CRM').at(0)],
    ['接收BRO超时', 60, (list) => list.filter(item => item.code === 'CML').at(0) || list.filter(item => item.code === 'CRM').at(0)],
    ['接收BCS超时', 5, (list) => list.filter(item => item.code === 'BCS').at(-1) || list.filter(item => item.code === 'BCL').at(0)],
    ['接收BCL超时', 1, (list) => list.filter(item => item.code === 'BCL').at(-1) || list.filter(item => item.code === 'CRO').at(0)],
    ['接收BST超时', 5, (list) => list.filter(item => item.code === 'CST').at(-1)],
    ['接收BSD超时', 5, (list) => list.filter(item => item.code === 'BST').at(-1) || list.filter(item => item.code === 'CST').at(-1)],
  ];
  const bem = [
    ['接收CRM(00)超时', 30, (list) => list.filter(item => item.code === 'CHM').at(0)],
    ['接收CRM(AA)超时', 30, (list) => list.filter(item => item.code === 'CHM').at(0)],
    ['接收CTS和CML超时', 5, (list) => list.filter(item => item.code === 'CRM').at(0)],
    ['接收CRO超时', 60, (list) => list.filter(item => item.code === 'BRO').at(0) || list.filter(item => item.code === 'CML').at(0)],
    ['接收CCS超时', 1, (list) => list.filter(item => item.code === 'CCS').at(-1) || list.filter(item => item.code === 'BCL').at(0)],
    ['接收CST超时', 5, (list) => list.filter(item => item.code === 'BST').at(-1)],
    ['接收CSD超时', 5, (list) => list.filter(item => item.code === 'BSD').at(-1) || list.filter(item => item.code === 'BST').at(-1)],
  ];
  for (const event of events) {
    const table = event.code === 'CEM' ? cem : event.code === 'BEM' ? bem : null;
    if (!table || event.status !== 'decoded') continue;
    const list = inHandshake(events, event.handshakeIndex, event.time).filter(item => item !== event);
    for (const [name, limit, startOf] of table) {
      const item = fieldByName(event, name);
      if (!item || item.raw !== 1) continue;
      compareTimeout(anomalies, event, name, startOf(list), limit);
    }
  }
}

function intervalHint(anomalies, later, earlier, limit, label) {
  if (!later || !earlier) return;
  const gap = later.time - earlier.time;
  if (gap <= limit) return;
  const mismatch = gap > limit * MUCH_LARGER;
  hint(anomalies, later, `提示：${label} ${gap.toFixed(3)} s，标准参考 ${limit} s${mismatch ? '，与标准超时不符' : ''}。只作时间线提示，不是故障结论`);
}

function timelineHints(events, anomalies) {
  const groups = new Map();
  for (const event of events) {
    if (event.handshakeIndex == null) continue;
    const list = groups.get(event.handshakeIndex) || [];
    list.push(event);
    groups.set(event.handshakeIndex, list);
  }
  for (const list of groups.values()) {
    const first = (code) => list.find(event => event.code === code && event.status === 'decoded');
    intervalHint(anomalies, first('CRM'), first('CHM'), 30, 'CRM 距首次 CHM');
    intervalHint(anomalies, first('BRM'), first('CRM'), 5, 'BRM 距首次 CRM');
    intervalHint(anomalies, first('CRO'), first('BRO'), 60, 'CRO 距首次 BRO');
    const bst = first('BST');
    const cst = first('CST');
    if (bst && cst) intervalHint(anomalies, bst.time >= cst.time ? bst : cst, bst.time >= cst.time ? cst : bst, 5, 'CST 与 BST 相隔');
    for (const code of ['BCS', 'BCP']) {
      const found = list.filter(event => event.code === code && event.status === 'decoded');
      for (let index = 1; index < found.length; index += 1) {
        intervalHint(anomalies, found[index], found[index - 1], 5, `${code} 相邻间隔`);
      }
    }
  }
  const main = events.filter(event => event.handshakeIndex != null);
  for (let index = 1; index < main.length; index += 1) {
    intervalHint(anomalies, main[index], main[index - 1], 10, '相邻报文间隔');
  }
  const handshakes = events.filter(event => event.code === 'CHM' && event.status === 'decoded' && event.handshakeIndex != null).length;
  if (handshakes > 4) {
    hint(anomalies, events.find(event => event.code === 'CHM' && event.status === 'decoded'), `提示：握手出现 ${handshakes} 次。按初次之外还可重连 3 次理解，第 5 次起超出。只作提示，不是故障结论`);
  }
}

export function appendAnalysisHints(events, anomalies) {
  tagHandshakes(events);
  hintCurrents(events, anomalies);
  hintBsm(events, anomalies);
  timeoutBits(events, anomalies);
  timelineHints(events, anomalies);
}
