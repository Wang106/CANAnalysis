const MESSAGE_RE = /^BO_\s+(\d+)\s+(\S+)\s*:\s*(\d+)\s+(\S+)/;
const SIGNAL_RE = /^SG_\s+(\w+)\s*(?:(M|m\d+)\s*)?:\s*(\d+)\|(\d+)@(\d)([+-])\s*\(([^,]+),([^)]+)\)\s*\[([^|]+)\|([^\]]+)\]\s*"([^"]*)"\s*(.*)$/;
const VALUE_RE = /^VAL_\s+(\d+)\s+(\w+)\s+(.*);$/;
const FLOAT_RE = /^SIG_VALTYPE_\s+(\d+)\s+(\w+)\s*:\s*([12])\s*;/;

export function parseDbcMessageLine(line) {
  const match = line.match(MESSAGE_RE);
  if (!match) return null;
  const encoded = Number(match[1]);
  const extended = (encoded & 0x80000000) !== 0;
  return {
    encoded,
    id: encoded & 0x1fffffff,
    extended,
    name: match[2],
    dlc: Number(match[3]),
    sender: match[4],
  };
}

export function parseDbcSignalLine(line) {
  const match = line.match(SIGNAL_RE);
  if (!match) return null;
  const mux = match[2] || null;
  return {
    name: match[1],
    mux,
    isMultiplexer: mux === 'M',
    muxValue: mux && /^m\d+$/.test(mux) ? Number(mux.slice(1)) : null,
    startBit: Number(match[3]),
    length: Number(match[4]),
    byteOrder: Number(match[5]),
    isSigned: match[6] === '-',
    factor: Number(match[7]),
    offset: Number(match[8]),
    min: Number(match[9]),
    max: Number(match[10]),
    unit: match[11] || '',
    receivers: (match[12] || '').trim(),
  };
}

export function parseDbcValueLine(line) {
  const match = line.match(VALUE_RE);
  if (!match) return null;
  const encoded = Number(match[1]);
  const table = {};
  const pair = /(-?\d+)\s+"([^"]*)"/g;
  let found;
  while ((found = pair.exec(match[3])) !== null) table[Number(found[1])] = found[2];
  return {encoded, name: match[2], table};
}

export function parseDbcFloatTypeLine(line) {
  const match = line.match(FLOAT_RE);
  if (!match) return null;
  const encoded = Number(match[1]);
  return {encoded, extended: (encoded & 0x80000000) !== 0, id: encoded & 0x1fffffff, name: match[2], floatType: Number(match[3])};
}
