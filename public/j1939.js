import {analyzeJ1939, readClassicAsc} from './can/j1939.mjs';

const $ = (id) => document.getElementById(id);
let current = null;

function hexBytes(bytes) {
  return bytes.map(value => value.toString(16).toUpperCase().padStart(2, '0')).join(' ');
}

function hex(value) {
  return value == null ? '—' : value.toString(16).toUpperCase();
}

function text(value) {
  return value == null || value === '' ? '—' : String(value);
}

function parseNumber(value) {
  const token = value.trim();
  if (!token) return null;
  if (/^0x[0-9a-f]+$/i.test(token) || /[a-f]/i.test(token)) return Number.parseInt(token.replace(/^0x/i, ''), 16);
  if (/^\d+$/.test(token)) return Number(token);
  return null;
}

function address(event) {
  if (event.format === 'PDU2') return `GE ${hex(event.groupExtension)}`;
  if (event.destination == null) return '—';
  return event.destination === 0xff ? '全局 255' : hex(event.destination);
}

function render() {
  if (!current) return;
  const pgn = parseNumber($('pgnFilter').value);
  const sa = parseNumber($('saFilter').value);
  const events = current.result.events.filter(event => (pgn == null || event.pgn === pgn) && (sa == null || event.sa === sa));
  const summary = $('summary');
  summary.hidden = false;
  summary.replaceChildren();
  for (const item of [current.result.edition, '离线', `显示 ${events.length} 条`, `CAN FD ${current.fdLines.length} 行`]) {
    const node = document.createElement('span');
    node.textContent = item;
    summary.append(node);
  }
  const body = $('events').querySelector('tbody');
  body.replaceChildren();
  for (const event of events) {
    const row = document.createElement('tr');
    const raw = (event.trace || []).map(frame => `L${frame.sourceLine ?? '—'} ${frame.id.toString(16).toUpperCase()} ${hexBytes(frame.raw)}`).join(' | ');
    const payload = event.status === 'reassembled' ? `载荷 ${hexBytes(event.raw)} | ${raw}` : raw;
    for (const value of [text(event.time), event.pgn == null ? '—' : `${hex(event.pgn)} (${event.pgn})`, text(event.format), hex(event.sa), address(event), event.transport ? `${event.status} ${event.transport}` : event.status, payload]) {
      const cell = document.createElement('td');
      cell.textContent = value;
      row.append(cell);
    }
    row.dataset.status = event.status;
    if (event.pgn != null) row.dataset.pgn = String(event.pgn);
    if (event.sa != null) row.dataset.sa = String(event.sa);
    body.append(row);
  }
  $('events').hidden = events.length === 0;
  const anomalyBody = $('anomalies').querySelector('tbody');
  anomalyBody.replaceChildren();
  for (const item of current.result.anomalies) {
    const row = document.createElement('tr');
    for (const value of [text(item.time), text(item.code), item.message]) {
      const cell = document.createElement('td');
      cell.textContent = value;
      row.append(cell);
    }
    anomalyBody.append(row);
  }
  $('anomalies').hidden = current.result.anomalies.length === 0;
}

$('logFile').addEventListener('change', async () => {
  const file = $('logFile').files?.[0];
  if (!file) return;
  $('fileNote').textContent = `${file.name} · 仅在当前浏览器解析`;
  const parsed = readClassicAsc(await file.text());
  current = {result: analyzeJ1939(parsed.frames, {fdLines: parsed.fdLines}), fdLines: parsed.fdLines};
  render();
});
$('pgnFilter').addEventListener('input', render);
$('saFilter').addEventListener('input', render);
