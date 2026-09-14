import assert from 'node:assert/strict';
import {parseDBC} from '../public/converters/dbc.mjs';
import {convert} from '../public/converters/core.mjs';

const dbc=`VERSION ""
BO_ 256 Drive: 8 ECU
 SG_ Speed : 0|16@1+ (0.1,0) [0|1000] "km/h" ECU
 SG_ SignedBE : 23|8@0- (1,-40) [-168|87] "degC" ECU
BO_ 512 State: 8 ECU
 SG_ Mode M : 0|8@1+ (1,0) [0|2] "" ECU
 SG_ Branch m1 : 8|8@1+ (2,1) [0|511] "V" ECU
`;
const parsed=parseDBC(dbc);
assert.equal(parsed.signals.length,4);
assert.equal(parsed.messages.get('256_s').name,'Drive');
assert.equal(parsed.signals.find(s=>s.name==='Branch').muxValue,1);

const selected=parsed.signals.filter(s=>['Speed','SignedBE','Branch'].includes(s.name));
const source=new Blob([`base hex timestamps absolute
0.000 1 100 Rx d 8 64 00 80 00 00 00 00 00
0.050 1 200 Rx d 8 01 0A 00 00 00 00 00 00
0.100 1 100 Rx d 8 C8 00 7F 00 00 00 00 00
0.150 1 200 Rx d 8 02 63 00 00 00 00 00 00
0.200 1 100 Rx d 8 2C 01 01 00 00 00 00 00
`]);
const result=await convert(source,'asc','csv',{signals:selected,intervalMs:100});
assert.equal(result.stats.frames,5);
assert.equal(result.stats.rows,3);
const rows=(await result.blob.text()).replace(/^\uFEFF/,'').trim().split(/\r?\n/).map(row=>row.split(','));
assert.deepEqual(rows[0],['序号','时间','Speed','SignedBE','Branch']);
assert.deepEqual(rows[1],['1','0.000000','10','-168','']);
assert.deepEqual(rows[2],['2','0.100000','20','87','21']);
assert.deepEqual(rows[3],['3','0.200000','30','-39','21']);

for(const intervalMs of [100,200,300,400,500,600,700,800,900,1000]){
  const output=await convert(source,'asc','csv',{signals:[selected[0]],intervalMs});
  assert.equal(output.stats.intervalMs,intervalMs);
}
await assert.rejects(()=>convert(source,'asc','csv',{signals:[],intervalMs:100}),/信号/);
await assert.rejects(()=>convert(source,'asc','csv',{signals:selected,intervalMs:150}),/时间间隔/);
const tooWide=parseDBC('BO_ 1 A: 8 E\n SG_ Wide : 0|64@1+ (1,0) [0|1] "" E\n').signals;
await assert.rejects(()=>convert(source,'asc','csv',{signals:tooWide,intervalMs:100}),/53 位/);
await assert.rejects(()=>convert(new Blob(['0 1 100 Rx d 8 00 00 00 00 00 00 00 00\n2000000 1 100 Rx d 8 00 00 00 00 00 00 00 00\n']),'asc','csv',{signals:[selected[0]],intervalMs:100}),/1000 万行/);
const floats=parseDBC('BO_ 768 FloatMsg: 8 E\n SG_ F32 : 0|32@1+ (1,0) [0|10] "" E\n SG_ F64 : 0|64@1+ (1,0) [0|10] "" E\nSIG_VALTYPE_ 768 F32 : 1;\nSIG_VALTYPE_ 768 F64 : 2;\n').signals;
const f32=await convert(new Blob(['0.0 1 300 Rx d 8 00 00 C0 3F 00 00 00 00\n']),'asc','csv',{signals:[floats[0]],intervalMs:100});
assert.match(await f32.blob.text(),/1\.5/);
const f64=await convert(new Blob(['0.0 1 300 Rx d 8 00 00 00 00 00 00 F8 3F\n']),'asc','csv',{signals:[floats[1]],intervalMs:100});
assert.match(await f64.blob.text(),/1\.5/);
console.log('PASS: DBC parsing, Intel/Motorola/signed/multiplexed decoding and 100–1000 ms CSV sampling');
