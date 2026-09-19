const fs=require('node:fs');
const assert=require('node:assert/strict');

const html=fs.readFileSync('public/online.html','utf8');
const script=fs.readFileSync('public/online.js','utf8');
const pages=['public/index.html','public/offline.html','public/aboutus.html','public/convert.html','public/online.html'];

for(const page of pages){
  const source=fs.readFileSync(page,'utf8');
  assert.match(source,/href="\/online"[^>]*>在线连接<\/a>|<span[^>]*>在线连接<\/span>/,`${page} must expose the online connection navigation item`);
  assert.doesNotMatch(source,/>在线解析</,`${page} must not keep the former online-analysis label`);
}

assert.match(html,/<title>在线连接 · CANAnalysis<\/title>/);
assert.match(html,/id="deviceModel"/);
assert.match(html,/id="channel"/);
assert.match(html,/id="bitrate"/);
assert.match(html,/id="connectButton"/);
assert.match(html,/id="disconnectButton"/);
assert.match(html,/只接收/);
assert.match(html,/本机连接服务/);

for(const model of ['PCAN-USB','PCAN-USB FD','USBCAN-I','USBCAN-II','USBCANFD','VN16xx','VN56xx']){
  assert.ok(script.includes(model),`online page must list ${model}`);
}
for(const bitrate of ['125000','250000','500000','800000','1000000']){
  assert.ok(script.includes(bitrate),`online page must provide ${bitrate} bit/s`);
}

assert.match(script,/ws:\/\/127\.0\.0\.1:8765/,'online page must use the loopback bridge endpoint');
assert.match(script,/listenOnly:\s*true/,'the first release must enforce receive-only mode');
assert.match(script,/action:\s*'connect'/);
assert.match(script,/action:\s*'disconnect'/);
assert.match(script,/action:\s*'list_devices'/);

console.log('PASS: online connection page contract');
