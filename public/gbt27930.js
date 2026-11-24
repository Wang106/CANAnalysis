import {analyze27930, framesFromClassicAsc} from './can/gbt27930-2015.mjs';
import {parseZlgCanTest} from './can/zlg-text.mjs';

const $ = (id) => document.getElementById(id);

function hexBytes(bytes) {
  return bytes.map(value => value.toString(16).toUpperCase().padStart(2, '0')).join(' ');
}

function text(value) {
  return value == null || value === '' ? '—' : String(value);
}

function render(result, skipped) {
  const summary = $('summary');
  summary.hidden = false;
  summary.replaceChildren();
  const sessionText = (result.sessions || []).map(session => {
    const stages = session.stages.map(stage => stage.stage).join('→') || '无阶段';
    return `会话${session.index} ${stages}`;
  }).join('；');
  for (const item of [result.edition, '离线', sessionText || '无已识别阶段', `未读取 ${skipped.length} 行`]) {
    const node = document.createElement('span');
    node.textContent = item;
    summary.append(node);
  }
  const events = $('events');
  const body = events.querySelector('tbody');
  body.replaceChildren();
  for (const event of result.events) {
    const row = document.createElement('tr');
    const fields = event.fields.length
      ? event.fields.map(field => `${field.name} ${field.value}${field.unit ? ' ' + field.unit : ''}${field.note ? '（' + field.note + '）' : ''}`).join('；')
      : '—';
    const raw = (event.trace || []).map(frame => {
      const line = frame.sourceLine == null ? '' : `L${frame.sourceLine} `;
      return `${line}${frame.id.toString(16).toUpperCase()} ${hexBytes(frame.raw)}`;
    }).join(' | ');
    for (const value of [text(event.time), text(event.stage), event.code ? `${event.code} ${event.name}` : event.name, event.status, fields, raw || hexBytes(event.raw)]) {
      const cell = document.createElement('td');
      cell.textContent = value;
      row.append(cell);
    }
    row.dataset.status = event.status;
    if (event.code) row.dataset.code = event.code;
    body.append(row);
  }
  events.hidden = result.events.length === 0;
  const sessionBody = $('sessions').querySelector('tbody');
  sessionBody.replaceChildren();
  for (const session of result.sessions || []) {
    const row = document.createElement('tr');
    for (const value of [
      String(session.index),
      session.stages.map(stage => `${stage.stage} ${stage.first}–${stage.last}`).join('；') || '—',
      session.stops.map(stop => `${stop.code} ${stop.time}`).join('；') || '—',
      session.residue.map(item => `${item.code} ${item.note}`).join('；') || '—',
    ]) {
      const cell = document.createElement('td');
      cell.textContent = value;
      row.append(cell);
    }
    sessionBody.append(row);
  }
  $('sessions').hidden = !(result.sessions || []).length;
  const anomalies = $('anomalies');
  const anomalyBody = anomalies.querySelector('tbody');
  anomalyBody.replaceChildren();
  for (const item of result.anomalies) {
    const row = document.createElement('tr');
    for (const value of [text(item.time), text(item.code), item.message]) {
      const cell = document.createElement('td');
      cell.textContent = value;
      row.append(cell);
    }
    anomalyBody.append(row);
  }
  anomalies.hidden = result.anomalies.length === 0;
}

$('logFile').addEventListener('change', async () => {
  const file = $('logFile').files?.[0];
  if (!file) return;
  $('fileNote').textContent = `${file.name} · 仅在当前浏览器解析`;
  const text = await file.text();
  const zlg = parseZlgCanTest(text);
  const asc = framesFromClassicAsc(text);
  const parsed = zlg.header ? zlg : asc;
  const note = $('emptyNote');
  if (!parsed.frames.length) {
    note.hidden = false;
    note.textContent = zlg.header
      ? '识别到 ZLG CANTest 表头，但没有读出数据帧。'
      : '未读出数据帧。这份文本既不是可解析的经典 ASC，也不是 ZLG CANTest 导出。';
  } else {
    note.hidden = !zlg.header;
    note.textContent = zlg.header ? zlg.unitNote : '';
  }
  render(analyze27930(parsed.frames), parsed.skipped || []);
});
