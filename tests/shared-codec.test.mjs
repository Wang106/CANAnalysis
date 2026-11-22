import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {applyScale, decodePhysical, signalFitsDlc, unsignedRaw} from '../public/can/codec.mjs';
import {parseClassicAscDataLine} from '../public/can/asc-text.mjs';
import {parseDbcMessageLine, parseDbcSignalLine, parseDbcValueLine} from '../public/can/dbc-text.mjs';
import {decodeSignal, parseDBC} from '../public/converters/dbc.mjs';
import {readText} from '../public/converters/text.mjs';

const sampleDbc = readFileSync('public/sample.dbc', 'utf8');
const sampleAsc = readFileSync('public/sample.asc', 'utf8');
const offline = readFileSync('public/offline.html', 'utf8');
const converter = readFileSync('public/converters/dbc.mjs', 'utf8');
const text = readFileSync('public/converters/text.mjs', 'utf8');

assert.match(offline, /src="\/can\/page-codec\.mjs"/, 'offline page must load the shared codec');
assert.match(converter, /from '\.\.\/can\/codec\.mjs'/);
assert.match(converter, /parseDbcSignalLine/);
assert.match(text, /parseClassicAscDataLine/);
assert.doesNotMatch(offline, /function extractRawAt\(data, base, dlc, sig\)\{\s*const \{startBit/, 'offline bit walk must live in the shared codec');

const parsed = parseDBC(sampleDbc);
const byName = new Map(parsed.signals.map(signal => [signal.name, signal]));
assert.equal(parsed.messages.size, 4);
assert.equal(byName.size, 7);
const rpm = byName.get('EngineRpm');
const temp = byName.get('EngineTemp');
const angle = byName.get('SteeringAngle');
assert.equal(rpm.byteOrder, 1);
assert.equal(temp.byteOrder, 0);
assert.equal(angle.isSigned, true);
assert.equal(angle.byteOrder, 0);

const engine = Uint8Array.of(0x00, 0x4b, 0x82, 0x00, 0x00, 0x00, 0x00, 0x00);
assert.equal(decodeSignal(engine, rpm), 2400);
assert.equal(decodeSignal(engine, temp), 90);
assert.equal(decodeSignal(engine, angle), 7.5);
assert.equal(applyScale(unsignedRaw(engine, rpm), rpm), 2400);
assert.equal(applyScale(unsignedRaw(engine, temp), temp), 90);
assert.equal(applyScale(unsignedRaw(engine, angle), angle), 7.5);

const wide = {name: 'Wide', startBit: 0, length: 53, byteOrder: 1, isSigned: false, factor: 1, offset: 0, floatType: 0};
const wideData = new Uint8Array(8);
wideData[6] = 0x10;
assert.equal(signalFitsDlc(wide, 7), true);
assert.equal(signalFitsDlc(wide, 6), false);
assert.equal(decodeSignal(wideData, wide), applyScale(unsignedRaw(wideData, wide), wide));
assert.equal(decodeSignal(wideData, wide), 2 ** 52);

const muxDbc = 'BO_ 256 MuxMsg: 8 ECU\n SG_ Switch M : 0|8@1+ (1,0) [0|255] "" ECU\n SG_ On m0 : 8|8@1+ (1,0) [0|255] "" ECU\n SG_ Off m1 : 8|16@0- (0.5,-10) [0|0] "" ECU\n';
const mux = parseDBC(muxDbc);
const on = mux.signals.find(signal => signal.name === 'On');
const off = mux.signals.find(signal => signal.name === 'Off');
const selected = Uint8Array.of(0, 9, 0, 0, 0, 0, 0, 0);
const other = Uint8Array.of(1, 0xff, 0x7f, 0, 0, 0, 0, 0);
assert.equal(decodeSignal(selected, on), 9);
assert.equal(decodeSignal(other, off), decodePhysical(other, off));
assert.notEqual(decodeSignal(other, off), decodeSignal(selected, off));

const value = parseDbcValueLine('VAL_ 512 EngineStatus 0 "Off" 1 "Idle" 2 "Run" ;');
assert.deepEqual(value.table, {0: 'Off', 1: 'Idle', 2: 'Run'});
assert.equal(parseDbcMessageLine('BO_ 512 EngineData: 8 Vector__XXX').id, 512);
assert.equal(parseDbcSignalLine('SG_ EngineRpm : 0|16@1+ (0.125,0) [0|8000] "rpm" Vector__XXX').factor, 0.125);

const ascLines = sampleAsc.split(/\n/).map(parseClassicAscDataLine).filter(item => item?.kind === 'data');
assert.equal(ascLines[0].time, 0);
assert.equal(ascLines[0].id, 0x200);
assert.equal(ascLines[0].channel, '1');
assert.deepEqual(ascLines[0].bytes, [0x00, 0x4b, 0x82, 0x00, 0x00, 0x00, 0x00, 0x00]);
assert.equal(ascLines.find(item => item.time === 0.01).time, 0.01);
assert.equal(parseClassicAscDataLine('0.1 1 10 Rx r 2 00 00').kind, 'rejected');

const blob = new Blob([sampleAsc]);
const converted = [];
for await (const frame of readText(blob, 'asc')) converted.push(frame);
assert.equal(converted.length, ascLines.length);
for (let index = 0; index < ascLines.length; index++) {
  assert.equal(converted[index].time, ascLines[index].time);
  assert.equal(converted[index].id, ascLines[index].id);
  assert.equal(converted[index].channel, Number(ascLines[index].channel));
  assert.deepEqual([...converted[index].data], ascLines[index].bytes);
}

console.log('PASS: shared DBC decode and classic ASC indexing');
