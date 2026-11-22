import {parseClassicAscDataLine} from './asc-text.mjs';

// Classic SAE J1939-21 identifier and transport framing. The 29-bit layout and
// PDU1/PDU2 split are taken from the Linux kernel documentation:
// https://docs.kernel.org/networking/j1939.html
// TP.CM 0xEC00, TP.DT 0xEB00, and the control bytes are the constants in
// Linux net/can/j1939/transport.c. The same BAM/RTS byte positions are
// restated by CSS Electronics' J1939-21-TP note. This module does not contain
// a J1939DA, does not name application SPNs, and never builds a frame to send.
// J1939-22 CAN FD and ISO 11783 ETP are out of scope.

const TP_CM = 0xec00;
const TP_DT = 0xeb00;
const BAM = 0x20;
const RTS = 0x10;
const CTS = 0x11;
const EOM = 0x13;
const ABORT = 0xff;
const ETP = new Set([0x14, 0x15, 0x16, 0x17]);
const MAX_TP_BYTES = 1785;

export const J1939_COVERAGE = {
  edition: 'SAE J1939-21 classic CAN',
  offline: true,
  certification: false,
  database: false,
  sources: [
    'https://docs.kernel.org/networking/j1939.html',
    'https://git.kernel.org/pub/scm/linux/kernel/git/torvalds/linux.git/tree/net/can/j1939/transport.c',
    'https://canlogger.csselectronics.com/tools-docs/decoders_mf4/transportprotocol/j1939tp.html',
  ],
  supported: ['29-bit PDU1/PDU2', 'TP.BAM reassembly', 'passive TP.RTS observation'],
  unsupported: ['J1939DA SPN names', 'J1939-22 CAN FD', 'ISO 11783 ETP', 'transmitting CTS or any other frame'],
};

export function framesFromClassicAsc(text) {
  const {frames, skipped} = readClassicAsc(text);
  return {frames, skipped};
}

export function readClassicAsc(text) {
  const frames = [];
  const skipped = [];
  const fdLines = [];
  String(text).split(/\n/).forEach((line, index) => {
    if (/^\s*[0-9.eE+-]+\s+CANFD\b/i.test(line)) {
      fdLines.push(index + 1);
      return;
    }
    const parsed = parseClassicAscDataLine(line);
    if (!parsed) return;
    if (parsed.kind !== 'data') {
      skipped.push(index + 1);
      return;
    }
    frames.push({
      time: parsed.time,
      id: parsed.id,
      data: parsed.bytes,
      extended: parsed.extended,
      sourceLine: index + 1,
    });
  });
  return {frames, skipped, fdLines};
}

export function parseJ1939Id(id) {
  const value = Number(id) >>> 0;
  const pf = (value >>> 16) & 0xff;
  const ps = (value >>> 8) & 0xff;
  const pdu1 = pf < 240;
  const pgnBits = (value >>> 8) & 0x3ffff;
  return {
    id: value,
    priority: (value >>> 26) & 7,
    reserved: (value >>> 25) & 1,
    dp: (value >>> 24) & 1,
    pf,
    ps,
    sa: value & 0xff,
    pgn: pdu1 ? pgnBits & 0x3ff00 : pgnBits,
    format: pdu1 ? 'PDU1' : 'PDU2',
    destination: pdu1 ? ps : null,
    groupExtension: pdu1 ? null : ps,
  };
}

export function pgnFromTransport(raw) {
  const value = Number(raw) >>> 0;
  const pf = (value >>> 8) & 0xff;
  return pf < 240 ? value & 0xffff00 : value & 0xffffff;
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

function expectedPackets(size) {
  return Math.ceil(size / 7);
}

function lengthConsistent(session) {
  return session.size >= 1 && session.size <= MAX_TP_BYTES && session.packets === expectedPackets(session.size);
}

function finishSession(session, frame, produced, anomalies, open, resolveMessage) {
  if (!lengthConsistent(session)) return;
  const data = [];
  for (let sequence = 1; sequence <= session.packets; sequence++) {
    const part = session.parts.get(sequence);
    if (!part) return;
    data.push(...part);
  }
  if (data.length < session.size) return;
  data.length = session.size;
  if (resolveMessage) {
    const message = resolveMessage(session.pgn);
    if (message) {
      produced.push({
        time: session.time,
        sourceIndex: session.sourceIndex,
        sourceLine: frame.sourceLine ?? null,
        id: session.id,
        data,
        header: {pgn: message.pgn, sa: frame.header?.sa ?? session.sa},
        kind: 'reassembled',
        message,
        trace: session.trace,
      });
    } else {
      anomalies.push({time: session.time, sourceIndex: session.sourceIndex, code: 'TP', message: `BAM 重组出的 PGN ${session.pgn} 不在本次 2015 范围内`});
    }
  } else {
    const pgn = pgnFromTransport(session.pgn);
    const pf = (pgn >>> 8) & 0xff;
    produced.push({
      time: session.time,
      sourceIndex: session.sourceIndex,
      sourceLine: frame.sourceLine ?? null,
      id: session.id,
      data,
      header: {
        pgn,
        sa: session.sa,
        destination: pf < 240 ? session.destination : null,
        groupExtension: pf < 240 ? null : pgn & 0xff,
        format: pf < 240 ? 'PDU1' : 'PDU2',
        priority: session.priority,
        dp: (pgn >>> 16) & 1,
        reserved: 0,
      },
      kind: 'reassembled',
      transport: session.transport,
      trace: session.trace,
    });
  }
  open.delete(session.key);
}

export function reassembleTransport(sorted, options = {}) {
  const sessionKey = options.sessionKey || ((header) => header.sa);
  const acceptRts = options.acceptRts === true;
  const resolveMessage = options.resolveMessage;
  const produced = [];
  const anomalies = [];
  const open = new Map();
  const closeOpen = (session, message) => {
    anomalies.push({time: session.time, sourceIndex: session.sourceIndex, code: session.transport === 'RTS' ? 'TP-RTS' : 'TP-BAM', message});
    produced.push({...session, header: {pgn: session.pgn, sa: session.sa}, kind: 'incomplete-tp', data: []});
    open.delete(session.key);
  };
  for (const frame of sorted) {
    const header = frame.header || parseJ1939Id(frame.id);
    frame.header = header;
    if (frame.extended === false) {
      produced.push({...frame, header, kind: 'single'});
      continue;
    }
    if (header.pgn === TP_CM) {
      const control = frame.data[0];
      const key = sessionKey(header);
      if (acceptRts && ETP.has(control)) {
        anomalies.push({time: frame.time, sourceIndex: frame.sourceIndex, code: 'ETP', message: '见到 ISO 11783 ETP 控制字节，本次不重组，不能当作传输成功'});
        produced.push({...frame, header, kind: 'control'});
        continue;
      }
      if ((control === BAM || (acceptRts && control === RTS)) && frame.data.length >= 8) {
        const previous = open.get(key);
        if (previous) closeOpen(previous, previous.transport === 'RTS' ? '上一包 RTS 未收齐，不作为重组成功' : '上一包 BAM 未收齐，不作为解码成功');
        const session = {
          size: frame.data[1] | (frame.data[2] << 8),
          packets: frame.data[3],
          pgn: frame.data[5] | (frame.data[6] << 8) | (frame.data[7] << 16),
          parts: new Map(),
          time: frame.time,
          sourceIndex: frame.sourceIndex,
          sourceLine: frame.sourceLine ?? null,
          id: frame.id,
          sa: header.sa,
          destination: header.destination,
          priority: header.priority,
          transport: control === RTS ? 'RTS' : 'BAM',
          key,
          trace: [traceOf(frame)],
        };
        open.set(key, session);
        if (!lengthConsistent(session)) {
          anomalies.push({time: frame.time, sourceIndex: frame.sourceIndex, code: 'TP-LEN', message: `${session.transport} 声明长度 ${session.size} 字节、${session.packets} 包，与每包 7 字节且不超过 ${MAX_TP_BYTES} 字节不一致，不作为重组成功`});
        }
        produced.push({...frame, header, kind: 'control'});
        continue;
      }
      if (acceptRts && (control === CTS || control === EOM)) {
        anomalies.push({time: frame.time, sourceIndex: frame.sourceIndex, code: 'TP-OBSERVE', message: control === CTS ? '日志里有 CTS。本工具不发送 CTS，也不把这一帧当成载荷解码成功' : '日志里有 End of Message ACK。本工具不发送确认，载荷仍只来自已经出现的数据帧'});
        produced.push({...frame, header, kind: 'control'});
        continue;
      }
      if (acceptRts && control === ABORT) {
        const session = open.get(key);
        if (session) closeOpen(session, '见到 Abort，未完成的传输不作为重组成功');
        else anomalies.push({time: frame.time, sourceIndex: frame.sourceIndex, code: 'TP-ABORT', message: 'Abort 没有对应的传输会话，不作为重组成功'});
        produced.push({...frame, header, kind: 'control'});
        continue;
      }
      if (control !== BAM) {
        anomalies.push({time: frame.time, sourceIndex: frame.sourceIndex, code: 'TP-CM', message: '见到非 BAM 的连接管理（含 RTS/CTS），本次不重组，不能当作报文解码成功'});
        produced.push({...frame, header, kind: 'control'});
        continue;
      }
    }
    if (header.pgn === TP_DT) {
      const session = open.get(sessionKey(header));
      if (!session) {
        anomalies.push({time: frame.time, sourceIndex: frame.sourceIndex, code: 'TP-DT', message: acceptRts ? '数据传输没有对应的 BAM 或 RTS，不作为重组成功' : '数据传输没有对应的 BAM，不作为解码成功'});
        produced.push({...frame, header, kind: 'control'});
        continue;
      }
      const sequence = frame.data[0];
      if (session.parts.has(sequence)) {
        anomalies.push({time: frame.time, sourceIndex: frame.sourceIndex, code: 'TP-DUP', message: `序号 ${sequence} 重复，保留先出现的数据，不把重复帧当成新的重组成功`});
        session.trace.push(traceOf(frame));
        continue;
      }
      session.parts.set(sequence, frame.data.slice(1, 8));
      session.trace.push(traceOf(frame));
      finishSession(session, frame, produced, anomalies, open, resolveMessage);
      continue;
    }
    produced.push({...frame, header, kind: 'single'});
  }
  for (const session of open.values()) {
    anomalies.push({time: session.time, sourceIndex: session.sourceIndex, code: session.transport === 'RTS' ? 'TP-RTS' : 'TP-BAM', message: session.transport === 'RTS' ? 'RTS 未收齐，不作为重组成功' : 'BAM 未收齐，不作为解码成功'});
    produced.push({...session, header: {pgn: session.pgn, sa: session.sa}, kind: 'incomplete-tp', data: []});
  }
  return {produced, anomalies};
}

function singleEvent(frame) {
  const header = frame.header;
  return {
    time: frame.time,
    sourceIndex: frame.sourceIndex,
    sourceLine: frame.sourceLine ?? null,
    id: frame.id,
    sa: header.sa,
    destination: header.destination,
    groupExtension: header.groupExtension,
    priority: header.priority,
    reserved: header.reserved,
    dp: header.dp,
    pgn: header.pgn,
    format: header.format,
    status: 'noted',
    transport: null,
    raw: [...frame.data],
    trace: [traceOf(frame)],
  };
}

export function analyzeJ1939(frames, extra = {}) {
  const indexed = frames.map((frame, sourceIndex) => ({...frame, sourceIndex, data: [...frame.data]}));
  const disordered = indexed.some((frame, index) => index > 0 && frame.time < indexed[index - 1].time);
  const sorted = [...indexed].sort((left, right) => left.time - right.time || left.sourceIndex - right.sourceIndex);
  const {produced, anomalies} = reassembleTransport(sorted, {
    acceptRts: true,
    sessionKey: (header) => `${header.sa}:${header.destination ?? 'ge'}`,
  });
  const events = [];
  for (const frame of produced) {
    if (frame.kind === 'control') continue;
    if (frame.extended === false) {
      events.push({time: frame.time, sourceIndex: frame.sourceIndex, sourceLine: frame.sourceLine ?? null, id: frame.id, pgn: null, sa: null, status: 'ignored', transport: null, raw: [...frame.data], trace: [traceOf(frame)], format: null});
      continue;
    }
    if (frame.kind === 'incomplete-tp') {
      events.push({time: frame.time, sourceIndex: frame.sourceIndex, sourceLine: frame.sourceLine ?? null, id: frame.id, pgn: pgnFromTransport(frame.pgn), sa: frame.sa, destination: frame.destination ?? null, status: 'incomplete', transport: frame.transport, raw: [], trace: frame.trace || [], format: null});
      continue;
    }
    if (frame.kind === 'reassembled') {
      events.push({
        time: frame.time,
        sourceIndex: frame.sourceIndex,
        sourceLine: frame.sourceLine ?? null,
        id: frame.id,
        pgn: frame.header.pgn,
        sa: frame.header.sa,
        destination: frame.header.destination,
        groupExtension: frame.header.groupExtension,
        priority: frame.header.priority,
        dp: frame.header.dp,
        format: frame.header.format,
        status: 'reassembled',
        transport: frame.transport,
        raw: [...frame.data],
        trace: frame.trace,
      });
      if (frame.transport === 'RTS') {
        anomalies.push({time: frame.time, sourceIndex: frame.sourceIndex, code: 'TP-RTS', message: 'RTS 数据帧已按日志被动重组。本工具不发送 CTS 或确认，这不表示传输握手已经完成'});
      }
      continue;
    }
    if (frame.data.length > 8) {
      events.push({...singleEvent(frame), status: 'unsupported', raw: [...frame.data]});
      anomalies.push({time: frame.time, sourceIndex: frame.sourceIndex, code: 'FD', message: '数据超过经典 CAN 的 8 字节，J1939-22 不在本次范围，不作为解码成功'});
      continue;
    }
    events.push(singleEvent(frame));
  }
  if (disordered) anomalies.unshift({time: indexed[0]?.time ?? 0, sourceIndex: 0, code: 'TIME', message: '输入时间戳存在回退；结果按时间排序，并保留原始序号'});
  if (extra.fdLines?.length) anomalies.push({time: null, sourceIndex: null, code: 'FD', message: `${extra.fdLines.length} 行 ASC CAN FD 不在经典 J1939-21 范围，不作为解码成功`});
  const ignored = events.filter(event => event.status === 'ignored').length;
  if (ignored) anomalies.push({time: null, sourceIndex: null, code: 'STANDARD', message: `${ignored} 条标准帧不是 29 位 J1939 标识符，未按故障判断`});
  return {edition: J1939_COVERAGE.edition, events, anomalies, coverage: J1939_COVERAGE, fdLines: extra.fdLines || []};
}
