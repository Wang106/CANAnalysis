import assert from 'node:assert/strict';
import {detectInputFormat,planBatch} from '../public/converters/batch.mjs';

const asc=new File(['base hex timestamps absolute\n0.1 1 123 Rx d 1 01\n'],'a.asc');
const log=new File(['***HEX***\n***ABSOLUTE MODE***\n00:00:00:1000 Rx 1 0x123 s 1 02\n'],'b.log');
const blf=new File([Buffer.from('LOGG')],'c.bin');

assert.equal(await detectInputFormat(asc),'asc');
assert.equal(await detectInputFormat(log),'log');
assert.equal(await detectInputFormat(blf),'blf');

const plan=await planBatch([asc,log,new File(['x'],'already.trc')],'trc');
assert.deepEqual(plan.convert.map(item=>item.input),['asc','log']);
assert.deepEqual(plan.skipped.map(item=>item.file.name),['already.trc']);
assert.equal(plan.convert[0].outputName,'a.trc');
assert.equal(plan.convert[1].outputName,'b.trc');

await assert.rejects(()=>planBatch([new File(['x'],'unknown.bin')],'asc'),/无法自动识别/);
console.log('PASS: mixed-format batch planning and same-format skipping');
