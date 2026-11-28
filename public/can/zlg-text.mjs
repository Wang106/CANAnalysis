// Zhou Ligong CANTest / ZCAN text export. The 0.1 ms per count default matches
// the periods stated for CHM, CRM, CEM, CCS and CST in the public GB/T 27930-2015
// restatement, but it is still an inference: the exporter does not print the unit.

export const ZLG_TIME_UNIT_SECONDS = 0.0001;
export const ZLG_TIME_UNIT_NOTE = '时间按 0.1 ms/计数换算。这是对照公开报文周期作出的推测，不是设备说明书给出的单位。';
const WRAP = 0x100000000;

export function isZlgCanTestHeader(line) {
  return /序号/.test(line) && /时间标识/.test(line) && /帧ID/.test(line) && /数据长度/.test(line) && /数据/.test(line);
}

const ROW = /^\s*(\d+)\s+(接收|发送)\s+(0x[0-9a-f]+|\d+)\s+(0x[0-9a-f]+|\d+)\s+(数据帧|远程帧)\s+(标准帧|扩展帧)\s+(0x[0-9a-f]+|\d+)\s*(.*?)\s*$/i;

function integer(token) {
  return /^(?:0x|[0-9a-f]*[a-f])/i.test(token) ? Number.parseInt(token.replace(/^0x/i, ''), 16) : Number(token);
}

export function createZlgClock(unitSeconds = ZLG_TIME_UNIT_SECONDS) {
  let lastRaw = null;
  let wraps = 0;
  return {
    get wraps() { return wraps; },
    seconds(token) {
      const raw = integer(token) >>> 0;
      if (lastRaw != null && raw < lastRaw) wraps += 1;
      lastRaw = raw;
      return (wraps * WRAP + raw) * unitSeconds;
    },
  };
}

export function parseZlgCanTestRow(line, clock) {
  const match = String(line).replace(/^\uFEFF/, '').match(ROW);
  if (!match) return null;
  const remote = match[5] === '远程帧';
  const dlc = integer(match[7]);
  const data = [];
  if (!remote) {
    for (const token of match[8].split(/\s+/)) {
      if (!token) continue;
      if (!/^[0-9a-f]{1,2}$/i.test(token)) return {error: '数据字节不是十六进制'};
      data.push(Number.parseInt(token, 16));
    }
    if (data.length !== dlc) return {error: `数据长度 ${data.length} 与声明的 ${dlc} 不一致`};
  }
  return {
    time: clock.seconds(match[3]),
    direction: match[2],
    id: integer(match[4]) >>> 0,
    extended: match[6] === '扩展帧',
    remote,
    dlc,
    data,
  };
}

export function parseZlgCanTest(text, options = {}) {
  const clock = createZlgClock(options.unitSeconds ?? ZLG_TIME_UNIT_SECONDS);
  const frames = [];
  const skipped = [];
  let header = false;
  String(text).split(/\n/).forEach((line, index) => {
    const source = line.replace(/\r$/, '');
    if (!source.trim()) return;
    if (isZlgCanTestHeader(source)) {
      header = true;
      return;
    }
    if (!header) return;
    const row = parseZlgCanTestRow(source, clock);
    if (!row) {
      skipped.push(index + 1);
      return;
    }
    if (row.error) {
      skipped.push(index + 1);
      return;
    }
    frames.push({...row, sourceLine: index + 1});
  });
  return {
    frames,
    skipped,
    header,
    wraps: clock.wraps,
    unitSeconds: options.unitSeconds ?? ZLG_TIME_UNIT_SECONDS,
    unitNote: ZLG_TIME_UNIT_NOTE,
  };
}
