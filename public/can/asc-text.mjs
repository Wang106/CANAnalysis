const ASC_DATA_RE = /^\s*([0-9]+\.?[0-9]*(?:[eE][-+]?[0-9]+)?)\s+(\d+)\s+([0-9A-Fa-f]+)([xX]?)\s+(Rx|Tx)\s+(\S+)\s+(\d+)\s*(.*)$/;

export function parseClassicAscDataLine(line) {
  const match = String(line).replace(/\r$/, '').match(ASC_DATA_RE);
  if (!match) return null;
  const time = Number(match[1]);
  if (!Number.isFinite(time)) return null;
  const frameType = match[6].toLowerCase();
  const dlc = Number(match[7]);
  const id = parseInt(match[3], 16);
  if (frameType !== 'd' || !Number.isFinite(id) || dlc <= 0 || dlc > 64) return {kind: 'rejected'};
  const bytes = [];
  for (const token of (match[8] || '').split(/\s+/)) {
    if (/^[0-9A-Fa-f]{1,2}$/.test(token) && bytes.length < dlc) bytes.push(parseInt(token, 16));
  }
  if (bytes.length !== dlc) return {kind: 'rejected'};
  return {
    kind: 'data',
    time,
    channel: match[2],
    id,
    extended: match[4].toLowerCase() === 'x',
    direction: match[5],
    rx: match[5] === 'Rx',
    dlc,
    bytes,
  };
}
