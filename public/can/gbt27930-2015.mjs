import {framesFromClassicAsc, reassembleTransport} from './j1939.mjs';

export {framesFromClassicAsc};

// Offline GB/T 27930-2015 identification. Constants are cross-checked between
// the public restatement at https://canfd.net/gbt27930.html and the field table
// in https://github.com/MisakaMikoto128/GBT27930-Sim (protocol_tables.py), which
// cites GB/T 27930-2015 section 11. This is not the standards body's text and
// is not a conformance claim. 2011 and 2023 layouts are intentionally absent.

const CHARGER = 0x56;
const BMS = 0xF4;

const MESSAGES = [
  {code: 'CHM', name: '充电机握手', pgn: 0x2600, stage: '握手', length: 3, periodMs: 250, source: CHARGER, timeoutMs: 5000},
  {code: 'BHM', name: 'BMS握手', pgn: 0x2700, stage: '握手', length: 2, periodMs: 250, source: BMS, timeoutMs: 5000},
  {code: 'CRM', name: '充电机辨识', pgn: 0x0100, stage: '辨识', length: 8, periodMs: 250, source: CHARGER, timeoutMs: 5000},
  {code: 'CTS', name: '充电机时间同步', pgn: 0x0700, stage: '参数配置', length: 7, periodMs: 500, source: CHARGER, timeoutMs: 5000, identifyOnly: true},
  {code: 'CML', name: '充电机最大输出能力', pgn: 0x0800, stage: '参数配置', length: 8, periodMs: 250, source: CHARGER, timeoutMs: 5000},
  {code: 'BRO', name: 'BMS充电准备就绪', pgn: 0x0900, stage: '参数配置', length: 1, periodMs: 250, source: BMS, timeoutMs: 5000},
  {code: 'CRO', name: '充电机输出准备就绪', pgn: 0x0a00, stage: '参数配置', length: 1, periodMs: 250, source: CHARGER, timeoutMs: 5000},
  {code: 'BCL', name: '电池充电需求', pgn: 0x1000, stage: '充电', length: 5, periodMs: 50, source: BMS, timeoutMs: 1000},
  {code: 'CCS', name: '充电机充电状态', pgn: 0x1200, stage: '充电', length: 7, periodMs: 50, source: CHARGER, timeoutMs: 1000},
  {code: 'BSM', name: '动力蓄电池状态信息', pgn: 0x1300, stage: '充电', length: 7, periodMs: 250, source: BMS, identifyOnly: true},
  {code: 'BST', name: 'BMS中止充电', pgn: 0x1900, stage: '充电', length: 4, periodMs: 10, source: BMS, identifyOnly: true},
  {code: 'CST', name: '充电机中止充电', pgn: 0x1a00, stage: '充电', length: 4, periodMs: 10, source: CHARGER, identifyOnly: true},
  {code: 'BSD', name: 'BMS统计数据', pgn: 0x1c00, stage: '结束', length: 7, periodMs: 250, source: BMS, timeoutMs: 5000},
  {code: 'CSD', name: '充电机统计数据', pgn: 0x1d00, stage: '结束', length: 8, periodMs: 250, source: CHARGER, timeoutMs: 5000},
  {code: 'BEM', name: 'BMS错误报文', pgn: 0x1e00, stage: '错误', length: 4, periodMs: 250, source: BMS, identifyOnly: true},
  {code: 'CEM', name: '充电机错误报文', pgn: 0x1f00, stage: '错误', length: 4, periodMs: 250, source: CHARGER, identifyOnly: true},
  {code: 'BCP', name: '动力蓄电池充电参数', pgn: 0x0600, stage: '参数配置', length: 13, periodMs: 500, source: BMS, timeoutMs: 5000, transport: true},
  {code: 'BCS', name: '电池充电总状态', pgn: 0x1100, stage: '充电', length: 9, periodMs: 250, source: BMS, timeoutMs: 5000, transport: true},
  {code: 'BRM', name: 'BMS和车辆辨识', pgn: 0x0200, stage: '辨识', length: 49, periodMs: 250, source: BMS, timeoutMs: 5000, transport: true, identifyOnly: true},
  {code: 'BMV', name: '单体动力蓄电池电压', pgn: 0x1500, stage: '充电', length: null, periodMs: 10000, source: BMS, unsupported: true},
  {code: 'BMT', name: '动力蓄电池温度', pgn: 0x1600, stage: '充电', length: null, periodMs: 10000, source: BMS, unsupported: true},
  {code: 'BSP', name: '动力蓄电池预留报文', pgn: 0x1700, stage: '充电', length: null, periodMs: 10000, source: BMS, unsupported: true},
];

const BY_PGN = new Map(MESSAGES.map(message => [message.pgn, message]));
export const GBT27930_COVERAGE = {
  edition: 'GB/T 27930-2015',
  offline: true,
  certification: false,
  sources: [
    'https://std.samr.gov.cn/gb/search/gbDetailed?id=71F772D80B0CD3A7E05397BE0A0AB82A',
    'https://canfd.net/gbt27930.html',
    'https://github.com/MisakaMikoto128/GBT27930-Sim/blob/main/charger/protocol_tables.py',
  ],
  decodedSingleFrame: ['CHM', 'BHM', 'CRM', 'CML', 'BRO', 'CRO', 'BCL', 'CCS', 'BSD', 'CSD'],
  decodedAfterTransport: ['BCP', 'BCS'],
  identifiedWithoutFieldDecode: ['CTS', 'BRM', 'BSM', 'BST', 'CST', 'BEM', 'CEM'],
  unsupported: ['BMV', 'BMT', 'BSP', '位域明细', 'GB/T 27930-2011', 'GB/T 27930-2023'],
};

function u16(data, offset) {
  return data[offset] | (data[offset + 1] << 8);
}

function scaled(data, offset, length, scale, bias) {
  let raw = 0;
  for (let index = 0; index < length; index++) raw += data[offset + index] * (256 ** index);
  const value = raw * scale + bias;
  if (scale >= 1) return value;
  const places = Math.round(-Math.log10(scale));
  return Number(value.toFixed(places));
}

function usablePayload(message, data) {
  if (message.length == null) return {bytes: data, padding: 0};
  if (data.length === message.length) return {bytes: data, padding: 0};
  if (data.length > message.length && data.slice(message.length).every(byte => byte === 0xff)) {
    return {bytes: data.slice(0, message.length), padding: data.length - message.length};
  }
  return null;
}

function readyText(value) {
  if (value === 0x00) return '未完成';
  if (value === 0xaa) return '完成';
  if (value === 0xff) return '无效';
  return '未定义';
}

function decodePayload(message, data) {
  if (message.code === 'CHM') return [{name: '协议版本', value: `${data[0]}.${u16(data, 1)}`, raw: [...data]}];
  if (message.code === 'BHM') return [{name: '最高允许充电总电压', value: scaled(data, 0, 2, 0.1, 0), unit: 'V'}];
  if (message.code === 'CRM') return [
    {name: '辨识结果', value: data[0] === 0xaa ? '成功' : data[0] === 0x00 ? '未成功' : '未定义', raw: data[0]},
    {name: '充电机编号', value: scaled(data, 1, 4, 1, 0)},
  ];
  if (message.code === 'CML') return [
    {name: '最高输出电压', value: scaled(data, 0, 2, 0.1, 0), unit: 'V'},
    {name: '最低输出电压', value: scaled(data, 2, 2, 0.1, 0), unit: 'V'},
    {name: '最大输出电流', value: scaled(data, 4, 2, 0.1, -400), unit: 'A'},
    {name: '最小输出电流', value: scaled(data, 6, 2, 0.1, -400), unit: 'A'},
  ];
  if (message.code === 'BRO' || message.code === 'CRO') return [{name: '准备状态', value: readyText(data[0]), raw: data[0]}];
  if (message.code === 'BCL') return [
    {name: '电压需求', value: scaled(data, 0, 2, 0.1, 0), unit: 'V'},
    {name: '电流需求', value: scaled(data, 2, 2, 0.1, -400), unit: 'A'},
    {name: '充电模式', value: data[4] === 0x01 ? '恒压' : data[4] === 0x02 ? '恒流' : '未定义', raw: data[4]},
  ];
  if (message.code === 'CCS') return [
    {name: '电压输出值', value: scaled(data, 0, 2, 0.1, 0), unit: 'V'},
    {name: '电流输出值', value: scaled(data, 2, 2, 0.1, -400), unit: 'A'},
    {name: '累计充电时间', value: u16(data, 4), unit: 'min'},
    {name: '充电允许', value: (data[6] & 3) === 1 ? '允许' : (data[6] & 3) === 0 ? '暂停' : '未定义', raw: data[6] & 3},
  ];
  if (message.code === 'BSD') return [
    {name: '中止荷电状态', value: data[0], unit: '%'},
    {name: '单体最低电压', value: scaled(data, 1, 2, 0.01, 0), unit: 'V'},
    {name: '单体最高电压', value: scaled(data, 3, 2, 0.01, 0), unit: 'V'},
    {name: '最低温度', value: data[5] - 50, unit: '℃'},
    {name: '最高温度', value: data[6] - 50, unit: '℃'},
  ];
  if (message.code === 'CSD') return [
    {name: '累计充电时间', value: u16(data, 0), unit: 'min'},
    {name: '输出能量', value: scaled(data, 2, 2, 0.1, 0), unit: 'kW·h'},
    {name: '充电机编号', value: scaled(data, 4, 4, 1, 0)},
  ];
  if (message.code === 'BCP') return [
    {name: '单体最高允许充电电压', value: scaled(data, 0, 2, 0.01, 0), unit: 'V'},
    {name: '最高允许充电电流', value: scaled(data, 2, 2, 0.1, -400), unit: 'A'},
    {name: '标称总能量', value: scaled(data, 4, 2, 0.1, 0), unit: 'kW·h'},
    {name: '最高允许充电总电压', value: scaled(data, 6, 2, 0.1, 0), unit: 'V'},
    {name: '最高允许温度', value: data[8] - 50, unit: '℃'},
    {name: '荷电状态', value: scaled(data, 9, 2, 0.1, 0), unit: '%'},
    {name: '当前电池电压', value: scaled(data, 11, 2, 0.1, 0), unit: 'V'},
  ];
  if (message.code === 'BCS') {
    const packed = u16(data, 4);
    return [
      {name: '充电电压测量值', value: scaled(data, 0, 2, 0.1, 0), unit: 'V'},
      {name: '充电电流测量值', value: scaled(data, 2, 2, 0.1, -400), unit: 'A'},
      {name: '最高单体电压', value: Number(((packed & 0x0fff) * 0.01).toFixed(2)), unit: 'V'},
      {name: '最高单体组号', value: packed >>> 12},
      {name: '荷电状态', value: data[6], unit: '%'},
      {name: '预估剩余充电时间', value: u16(data, 7), unit: 'min'},
    ];
  }
  return [];
}

function traceOf(frame) {
  return {
    time: frame.time,
    sourceIndex: frame.sourceIndex,
    sourceLine: frame.sourceLine ?? null,
    id: frame.id,
    raw: [...frame.data],
  };
}

function eventFrom(message, frame, data, transport) {
  const usable = usablePayload(message, data);
  const matched = usable != null;
  const status = !matched
    ? (message.unsupported || message.identifyOnly ? 'incomplete' : 'incomplete')
    : (message.unsupported || message.identifyOnly ? 'identified' : 'decoded');
  const bytes = usable ? usable.bytes : data;
  const fields = status === 'decoded' ? decodePayload(message, bytes) : [];
  for (const field of fields) {
    if (field.unit === 'A' && typeof field.value === 'number' && field.value < 0) field.note = '负值表示充电方向';
  }
  return {
    time: frame.time,
    sourceIndex: frame.sourceIndex,
    sourceLine: frame.sourceLine ?? null,
    id: frame.id,
    sa: frame.header?.sa ?? null,
    code: message.code,
    name: message.name,
    stage: message.stage,
    pgn: message.pgn,
    status,
    transport: transport || null,
    fields,
    padding: usable?.padding || 0,
    raw: [...bytes],
    trace: frame.trace || [traceOf(frame)],
  };
}

function reassembleBam(sorted) {
  return reassembleTransport(sorted, {
    acceptRts: true,
    observeControl: false,
    sessionKey: (header) => `${header.sa}:${header.destination ?? ''}`,
    resolveMessage: (pgn) => BY_PGN.get(pgn & 0xffff00) || null,
  });
}

function gapAnomalies(events, code, limitMs) {
  const found = events.filter(event => event.code === code && event.status === 'decoded');
  const anomalies = [];
  for (let index = 1; index < found.length; index++) {
    const gap = (found[index].time - found[index - 1].time) * 1000;
    if (gap > limitMs) anomalies.push({time: found[index].time, sourceIndex: found[index].sourceIndex, code, message: `${code} 相邻间隔 ${gap.toFixed(0)} ms，超过公开资料所述 ${limitMs} ms`});
  }
  return anomalies;
}

export function analyze27930(frames) {
  const indexed = frames.map((frame, sourceIndex) => ({...frame, sourceIndex, data: [...frame.data]}));
  const disordered = indexed.some((frame, index) => index > 0 && frame.time < indexed[index - 1].time);
  const sorted = [...indexed].sort((left, right) => left.time - right.time || left.sourceIndex - right.sourceIndex);
  const {produced, anomalies} = reassembleBam(sorted);
  const events = [];
  let unknown = 0;
  let ignored = 0;
  for (const frame of produced) {
    if (frame.kind === 'control') continue;
    if (frame.extended === false) {
      ignored++;
      events.push({time: frame.time, sourceIndex: frame.sourceIndex, sourceLine: frame.sourceLine ?? null, id: frame.id, code: null, name: '非扩展帧', stage: null, pgn: null, status: 'ignored', fields: [], raw: [...frame.data], trace: [traceOf(frame)]});
      continue;
    }
    if (frame.kind === 'incomplete-tp') {
      const message = BY_PGN.get(frame.pgn & 0xffff00);
      events.push({time: frame.time, sourceIndex: frame.sourceIndex, sourceLine: frame.sourceLine ?? null, id: frame.id, sa: frame.sa, code: message?.code || 'TP', name: message?.name || '多包传输', stage: message?.stage || null, pgn: message?.pgn ?? frame.pgn, status: 'incomplete', transport: frame.transport || null, fields: [], raw: [], trace: frame.trace || []});
      continue;
    }
    if (frame.kind === 'reassembled') {
      events.push(eventFrom(frame.message, frame, frame.data, frame.transport || null));
      continue;
    }
    const message = BY_PGN.get(frame.header.pgn);
    if (!message) {
      unknown++;
      events.push({time: frame.time, sourceIndex: frame.sourceIndex, sourceLine: frame.sourceLine ?? null, id: frame.id, code: null, name: '未知报文', stage: null, pgn: frame.header.pgn, status: 'unknown', fields: [], raw: [...frame.data], trace: [traceOf(frame)]});
      continue;
    }
    const event = eventFrom(message, frame, frame.data, null);
    events.push(event);
    if (event.sa != null && event.sa !== 0x56 && event.sa !== 0xf4) {
      event.foreign = true;
      anomalies.push({time: event.time, sourceIndex: event.sourceIndex, code: event.code, message: `${event.code} 源地址 ${event.sa.toString(16)} 不是 56 或 f4，单独列出，不参与主会话`});
    } else if (event.sa != null && event.sa !== message.source) {
      anomalies.push({time: event.time, sourceIndex: event.sourceIndex, code: event.code, message: `${event.code} 源地址 ${event.sa.toString(16)} 与资料所述 ${message.source.toString(16)} 不一致`});
    }
    if (event.padding) anomalies.push({time: event.time, sourceIndex: event.sourceIndex, code: event.code, message: `${event.code} 多出 ${event.padding} 字节且均为 FF，已按声明长度 ${message.length} 处理`});
  }
  if (disordered) anomalies.unshift({time: indexed[0]?.time ?? 0, sourceIndex: 0, code: 'TIME', message: '输入时间戳存在回退；结果按时间排序，并保留原始序号'});
  if (unknown) anomalies.push({time: null, sourceIndex: null, code: 'UNKNOWN', message: `${unknown} 条扩展帧不在本次 2015 报文表内，未按故障判断`});
  if (ignored) anomalies.push({time: null, sourceIndex: null, code: 'STANDARD', message: `${ignored} 条非扩展帧不在本次 2015 范围内，未按故障判断`});
  for (const event of events) {
    if (event.status === 'incomplete' && !event.transport) anomalies.push({time: event.time, sourceIndex: event.sourceIndex, code: event.code, message: `${event.code} 数据长度 ${event.raw.length}，与资料所述 ${BY_PGN.get(event.pgn).length} 字节不一致，未按解码成功处理`});
  }
  const identified = new Map();
  for (const event of events) {
    if (event.status === 'identified') identified.set(event.code, (identified.get(event.code) || 0) + 1);
  }
  for (const [code, count] of identified) {
    anomalies.push({time: null, sourceIndex: null, code, message: `${code} 已识别 ${count} 帧，字段解码未纳入本次范围`});
  }
  anomalies.push(...gapAnomalies(events, 'BCL', 1000), ...gapAnomalies(events, 'CCS', 1000));
  const {sessions, foreign} = buildSessions(events);
  const stages = sessions.flatMap(session => session.stages.map(stage => stage.stage));
  const known = events.filter(event => !event.foreign && (event.status === 'decoded' || event.status === 'identified'));
  if (known.length && !known.some(event => event.stage === '握手' || event.stage === '辨识')) {
    anomalies.push({time: known[0].time, sourceIndex: known[0].sourceIndex, code: 'SESSION', message: '会话中未见握手或辨识报文，记录为不完整会话'});
  }
  return {edition: GBT27930_COVERAGE.edition, events, stages, sessions, foreign, anomalies, coverage: GBT27930_COVERAGE, unknown};
}

const MAIN_ADDRESS = new Set([0x56, 0xf4]);
const STOP_CODES = new Set(['BST', 'CST', 'BEM', 'CEM']);
const END_CODES = new Set(['BSD', 'CSD']);

function buildSessions(events, gapSeconds = 5) {
  const sessions = [];
  const foreign = [];
  let current = null;
  let previousTime = null;
  for (const event of events) {
    if (!event.code || event.foreign || (event.sa != null && !MAIN_ADDRESS.has(event.sa))) {
      if (event.code && event.sa != null && !MAIN_ADDRESS.has(event.sa)) foreign.push(event);
      continue;
    }
    const restart = event.code === 'CHM' && current && current.stages.some(stage => stage.stage !== '握手');
    const gap = previousTime != null && event.time - previousTime > gapSeconds;
    if (!current || restart || gap) {
      current = {index: sessions.length + 1, start: event.time, end: event.time, stages: [], stops: [], residue: []};
      sessions.push(current);
    }
    current.end = event.time;
    if (!current.stages.length && END_CODES.has(event.code)) {
      current.residue.push({code: event.code, time: event.time, note: '前一会话残留'});
      previousTime = event.time;
      continue;
    }
    if (STOP_CODES.has(event.code)) {
      current.stops.push({code: event.code, name: event.name, time: event.time});
      previousTime = event.time;
      continue;
    }
    if (event.stage && (event.status === 'decoded' || event.status === 'identified')) {
      const last = current.stages.at(-1);
      if (!last || last.stage !== event.stage) current.stages.push({stage: event.stage, first: event.time, last: event.time});
      else last.last = event.time;
    }
    previousTime = event.time;
  }
  return {sessions, foreign};
}
