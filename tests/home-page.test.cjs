const fs=require('node:fs');
const assert=require('node:assert/strict');

const home=fs.readFileSync('public/index.html','utf8');
const offline=fs.readFileSync('public/offline.html','utf8');
const pages=['index.html','offline.html','online.html','convert.html','aboutus.html'];

assert.match(home,/<title>首页 · CANAnalysis<\/title>/);
assert.match(home,/class="[^\"]*page-grid/);
assert.equal((home.match(/class="[^"]*page-card/g)||[]).length,7,'home must show every non-home navigation destination');
assert.equal((home.match(/class="card-visual/g)||[]).length,7,'every home card must include a centered visual area');
assert.match(home,/<h1 id="home-title">选择适合你的 <em>CAN 数据工具<\/em><\/h1>/,'home title must remain on one line');
assert.match(home,/class="card-visual hardware-visual"[\s\S]*?device-pcan\.png[\s\S]*?PCAN[\s\S]*?device-vector\.png[\s\S]*?Vector[\s\S]*?device-zlg\.png[\s\S]*?周立功[\s\S]*?class="hardware-more"[^>]*>…/,'online card must place each matching device image above its name and show a trailing ellipsis');
assert.match(home,/class="card-visual curve-visual"[\s\S]*?<svg/,'offline card must use an analysis-curve visual');
for(const asset of ['device-pcan.png','device-vector.png','device-zlg.png']){assert.equal(fs.existsSync('public/'+asset),true,asset+' must exist');assert.ok(fs.statSync('public/'+asset).size>50000,asset+' must be a real product cutout');}
for(const format of ['ASC','LOG','TRC','BLF','TXT','MF4','MDF','CSV'])assert.match(home,new RegExp(`<span(?: class="format-output")?>${format}<`),`format card must include ${format} in a circular node`);
assert.match(home,/id="formatArrow"[\s\S]*?<path d="M58 35H422M58 107H422/,'format nodes must be connected by a shared conversion harness');
assert.match(fs.readFileSync('public/home.css','utf8'),/marker-start:url\(#formatArrow\);marker-end:url\(#formatArrow\)/,'format harness must show arrows in both directions');
assert.match(home,/class="card-visual protocol-visual"[\s\S]*?>握手<[\s\S]*?>辨识<[\s\S]*?>参数配置<[\s\S]*?>充电<[\s\S]*?>结束</,'27930 stages must follow the requested left-to-right order');

for(const card of home.match(/<(?:a|article) class="page-card[\s\S]*?<\/(?:a|article)>/g)||[]){
  assert.ok(card.indexOf('<h2>')<card.indexOf('class="card-visual'),'card title must precede the centered visual');
  assert.ok(card.indexOf('class="card-visual')<card.indexOf('<p>'),'card description must follow the centered visual');
}

for(const [route,title] of [['/online','在线连接'],['/offline','离线报文解析'],['/convert','格式转换'],['/aboutus','关于本站']]){
  assert.match(home,new RegExp(`<a[^>]+href="${route}"[^>]*[\\s\\S]*?${title}`),`${title} must be an enabled home card`);
}
for(const title of ['27930报文分析','J1939分析','友情链接']){
  const pattern=new RegExp(`<article[^>]+(?:pending|disabled)[^>]*[\\s\\S]*?${title}`);
  assert.match(home,pattern,`${title} must be a disabled gray home card`);
}
assert.match(offline,/data-collapse="charts"/,'offline analysis must preserve chart-triggered navigation collapse');
assert.match(offline,/<span class="nav-item active" aria-current="page">离线报文解析<\/span>/);
assert.doesNotMatch(home,/id="btnDbc"|id="btnAsc"/,'home must not contain the offline file controls');

for(const page of pages){
  const source=fs.readFileSync('public/'+page,'utf8');
  assert.doesNotMatch(source,/J939/,`${page} must rename J939 to J1939`);
  assert.match(source,/>J1939分析</,`${page} must expose J1939 in shared navigation`);
  if(page!=='index.html')assert.match(source,/href="\/"[^>]*>首页<\/a>/,`${page} must link back to home`);
}

console.log('PASS: home page, offline route and complete navigation cards');
