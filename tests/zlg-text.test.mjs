import assert from 'node:assert/strict';
import test from 'node:test';
import {parseZlgCanTest, ZLG_TIME_UNIT_NOTE} from '../public/can/zlg-text.mjs';
import {readText} from '../public/converters/text.mjs';

const header = '序号\t传输方向\t接收时间标识\t帧ID\t帧格式\t帧类型\t数据长度\t数据';

function blob(text) {
  return new Blob([text]);
}

test('synthetic ZLG CANTest rows use the inferred 0.1 ms count and wrap at 32 bits', async () => {
  const text = [
    header,
    '0\t\t接收   0x0000000a          0x1826f456  数据帧  扩展帧  0x03       01 01 00',
    '1\t\t接收   0x00000002          0x182756f4  数据帧  扩展帧  0x02       88 13',
  ].join('\n');
  const parsed = parseZlgCanTest(text);
  assert.match(parsed.unitNote, /推测/);
  assert.equal(ZLG_TIME_UNIT_NOTE, parsed.unitNote);
  assert.equal(parsed.frames.length, 2);
  assert.equal(parsed.frames[0].time, 10 * 0.0001);
  assert.equal(parsed.frames[0].id, 0x1826f456);
  assert.equal(parsed.frames[0].extended, true);
  assert.deepEqual(parsed.frames[0].data, [1, 1, 0]);
  assert.equal(parsed.wraps, 1);
  assert.equal(parsed.frames[1].time, (0x100000000 + 2) * 0.0001);
  const empty = parseZlgCanTest(`${header}\n`);
  assert.equal(empty.header, true);
  assert.equal(empty.frames.length, 0);
  const frames = [];
  for await (const frame of readText(blob(text), 'txt')) frames.push(frame);
  assert.equal(frames.length, 2);
  assert.equal(frames[0].id, 0x1826f456);
});
