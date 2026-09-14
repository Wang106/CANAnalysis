import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {convert, readFrames} from '../public/converters/core.mjs';

const samples = JSON.parse(await readFile(new URL('convert-fixtures.json', import.meta.url), 'utf8'));
const source = new Blob(['date Sun Sep 13 00:00:00.000 2026\nbase hex timestamps absolute\ninternal events logged\n0.125 1 123 Rx d 4 00 01 FE FF\n3601.250123 2 18FF50E5x Tx d 8 00 01 02 03 04 05 06 07\n3601.3 1 7FF Rx d 0\n']);
const collect = async (blob, format, options={}) => {const rows=[];for await (const frame of readFrames(blob, format, options)) rows.push(frame);return rows;};
const expected=await collect(source,'asc');
assert.equal(expected.length,3);
for(const format of ['asc','log','trc','txt','blf','mf4','mdf']){
  const result=await convert(source,'asc',format);
  assert.equal(result.stats.frames,3,format);
  const actual=await collect(result.blob,format);
  assert.equal(actual.length,3,format);
  for(let i=0;i<3;i++){
    for(const key of ['id','extended','channel','rx','remote','fd'])assert.equal(actual[i][key],expected[i][key],format+' '+key);
    assert.deepEqual([...actual[i].data],[...expected[i].data],format+' payload');
    assert.ok(Math.abs(actual[i].time-expected[i].time)<(format==='log'?0.000051:0.000002),format+' timestamp');
  }
}
for(const [name,base64] of Object.entries(samples)){
  const format=name.split('-')[0],blob=new Blob([Buffer.from(base64,'base64')]);
  const rows=await collect(blob,format);
  assert.equal(rows.length,3,name);
  assert.deepEqual(rows.map(f=>f.id),expected.map(f=>f.id),name);
  assert.deepEqual(rows.map(f=>[...f.data]),expected.map(f=>[...f.data]),name);
  assert.ok(Math.abs((rows[1].time-rows[0].time)-(expected[1].time-expected[0].time))<0.000002,name+' interval');
}
const fd=new Blob(['base hex timestamps absolute\n1.5 CANFD 1 Tx 123 1 0 9 12 00 01 02 03 04 05 06 07 08 09 0A 0B\n']);
for(const [kind,brs,esi] of [['FD',false,false],['FB',true,false],['FE',false,true],['BI',true,true]]){
  const trc=new Blob([';$FILEVERSION=2.1\n;$COLUMNS=N,O,T,B,I,d,R,L,D\n1 1500.000 '+kind+' 1 0123 Rx - 1 FF\n']);
  const rows=await collect(trc,'trc');assert.equal(rows[0].brs,brs);assert.equal(rows[0].esi,esi);
  const result=await convert(trc,'trc','trc');assert.ok((await result.blob.text()).includes(' '+kind+' '));
}
for(const format of ['asc','trc','blf','mf4']){
  const result=await convert(fd,'asc',format),rows=await collect(result.blob,format);
  assert.equal(rows[0].fd,true,format);assert.equal(rows[0].brs,true,format);assert.equal(rows[0].data.length,12,format);
}
for(const format of ['log','txt','mdf'])await assert.rejects(()=>convert(fd,'asc',format),/CAN FD/);
await assert.rejects(()=>convert(new Blob(['0.1 1 123 Rx d 2 01 ZZ\n']),'asc','blf'),/字节|数据/);
await assert.rejects(()=>convert(new Blob(['0.1 1 123 Rx d 8 01\n']),'asc','asc'),/长度|数据/);
await assert.rejects(()=>convert(new Blob(['0.1 1 ErrorFrame\n']),'asc','asc'),/错误帧/);
await assert.rejects(()=>convert(new Blob(['not a log']),'asc','asc'),/报文|格式/);
await assert.rejects(()=>convert(new Blob([Buffer.from('LOGG')]),'blf','asc'),/截断|损坏|BLF/);
const remote=new Blob(['0.100 1 123 Rx r 8\n']);
for(const format of ['asc','trc','blf','log','txt','mf4','mdf']){
 const result=await convert(remote,'asc',format),rows=await collect(result.blob,format);
 assert.equal(rows[0].remote,true,format);assert.equal(rows[0].dlc,8,format);assert.equal(rows[0].data.length,0,format);
}
console.log('PASS: seven-format round trips, independent fixtures, FD, remote frames and malformed-input rejection');

const zeroed=await convert(source,'asc','asc',{zeroTime:true});
assert.equal(zeroed.stats.first,0);assert.equal(zeroed.preview[1].time,3601.250123-0.125);
assert.match((await convert(source,'asc','log')).warnings.join(''),/0.1 毫秒/);
const logSample=new Blob(['***HEX***\n***ABSOLUTE MODE***\n00:00:01:1250 Rx 1 0x123 s 2 01 FF\n']);
assert.equal((await collect(logSample,'log'))[0].time,1.125);
await assert.rejects(()=>convert(new Blob(['***RELATIVE MODE***\n']),'log','asc'),/相对时间/);
const utf16=Buffer.concat([Buffer.from([255,254]),Buffer.from(await source.text(),'utf16le')]);
assert.equal((await collect(new Blob([utf16]),'asc')).length,3);
// Split a CAN row across the 1 MiB text-read boundary.
const crossing=new Blob([';'.repeat(1024*1024-16)+'\n',await source.text()]);
assert.equal((await collect(crossing,'asc')).length,3);
console.log('PASS: origin normalization, precision warnings, BusMaster, UTF-16 and chunk boundaries');
