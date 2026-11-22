const fs=require('node:fs');
const assert=require('node:assert/strict');

const home=fs.readFileSync('public/index.html','utf8');
const offline=fs.readFileSync('public/offline.html','utf8');
const pages=['index.html','offline.html','online.html','convert.html','aboutus.html','gbt27930.html','j1939.html'];

assert.match(home,/<title>首页 · CANAnalysis<\/title>/);
assert.match(home,/class="[^\"]*page-grid/);
assert.equal((home.match(/class="[^"]*page-card/g)||[]).length,7,'home must show every non-home navigation destination');
assert.equal((home.match(/class="card-visual/g)||[]).length,7,'every home card must include a centered visual area');
assert.doesNotMatch(home,/CAN DATA TOOLBOX|选择适合你的|从设备实时连接到离线日志分析/,'home must remove the introductory toolbox copy');
assert.match(home,/<article class="page-card online-card pending" aria-disabled="true" title="尚未完成验证">[\s\S]*?<span class="card-state">未验证<\/span>[\s\S]*?<h2>在线连接<\/h2>/,'online connection must be a disabled gray home card');
assert.doesNotMatch(home,/<a class="page-card online-card"|href="\/online"[^>]*class="page-card/,'online connection home card must not be clickable');
assert.match(home,/class="card-visual hardware-visual"[\s\S]*?device-pcan\.png[\s\S]*?PCAN[\s\S]*?device-vector\.png[\s\S]*?Vector[\s\S]*?device-zlg\.png[\s\S]*?周立功[\s\S]*?class="hardware-more"[^>]*>…/,'online card must place each matching device image above its name and show a trailing ellipsis');
assert.match(home,/class="card-visual curve-visual"[\s\S]*?<svg/,'offline card must use an analysis-curve visual');
for(const asset of ['device-pcan.png','device-vector.png','device-zlg.png']){assert.equal(fs.existsSync('public/'+asset),true,asset+' must exist');assert.ok(fs.statSync('public/'+asset).size>50000,asset+' must be a real product cutout');}
for(const format of ['ASC','LOG','TRC','BLF','TXT','MF4','MDF','CSV'])assert.match(home,new RegExp(`<span(?: class="format-output")?>${format}<`),`format card must include ${format} in a circular node`);
assert.doesNotMatch(home,/format-connector/,'format card must not draw a line between bubbles');
assert.doesNotMatch(home,/class="format-leaves"|leaf-fall/,'format card must not include falling leaves');
assert.match(home,/<span>CSV<\/span>/,'CSV must use the same bubble markup and color as every other format');
const homeCss=fs.readFileSync('public/home.css','utf8');
assert.match(homeCss,/\.format-nodes span\{[^}]*position:absolute/s,'format circles must use individually positioned nodes');
assert.ok((homeCss.match(/\.format-nodes span:nth-child\(/g)||[]).length>=8,'all format circles must receive deliberately irregular positions');
assert.doesNotMatch(homeCss,/\.format-connector/,'bubble connector styling must be removed');
assert.doesNotMatch(homeCss,/\.format-output|@keyframes leaf-fall|@keyframes format-float/,'CSV must not have a special color and obsolete leaf/float animations must be removed');
const bubbleJs=fs.readFileSync('public/home-format-bubbles.js','utf8');
assert.match(bubbleJs,/function collide\(a,b\)/,'format bubbles must detect and resolve collisions');
assert.match(bubbleJs,/body\.vx\*=-1/,'format bubbles must bounce off the visual boundary');
assert.match(bubbleJs,/visual\.addEventListener\('click',kick\)/,'format visual must intercept clicks instead of navigating');
assert.match(bubbleJs,/event\.preventDefault\(\)[\s\S]*event\.stopPropagation\(\)/,'clicking anywhere in the format visual must not follow the card link');
assert.match(bubbleJs,/Math\.pow\(1-distance\/radius,2\)/,'nearby bubbles must receive a distance-decayed push');
assert.match(bubbleJs,/body\.vx\+=dx\/distance\*force/,'clicked and nearby bubbles must be pushed away from the pointer');
assert.match(bubbleJs,/const idleSpeed=\.36/,'idle bubble movement must remain clearly visible at a softer pace');
assert.match(bubbleJs,/const drag=Math\.pow\(\.996,step\)/,'fast bubbles must gradually slow down after a click');
assert.match(home,/class="card-visual protocol-visual"[\s\S]*?>握手<[\s\S]*?>辨识<[\s\S]*?>参数配置<[\s\S]*?>充电<[\s\S]*?>结束</,'27930 stages must follow the requested left-to-right order');
assert.match(homeCss,/span:nth-of-type\(1\),\.protocol-visual span:nth-of-type\(2\),\.protocol-visual span:nth-of-type\(5\)\{[^}]*width:56px[^}]*height:56px[^}]*border-radius:50%/s,'handshake, identification and ending stages must be circular');
assert.match(homeCss,/span:nth-of-type\(4\)\{[^}]*width:76px[^}]*height:42px[^}]*border-radius:999px[^}]*writing-mode:horizontal-tb/s,'charging stage must be a horizontal ellipse');

for(const card of home.match(/<(?:a|article) class="page-card[\s\S]*?<\/(?:a|article)>/g)||[]){
  assert.ok(card.indexOf('<h2>')<card.indexOf('class="card-visual'),'card title must precede the centered visual');
  assert.doesNotMatch(card,/<p>/,'home cards must not contain descriptive small copy');
}

for(const [route,title] of [['/offline','离线分析'],['/convert','格式转换'],['/aboutus','关于本站'],['/gbt27930','27930解析'],['/j1939','J1939分析']]){
  assert.match(home,new RegExp(`<a[^>]+href="${route}"[^>]*[\\s\\S]*?${title}`),`${title} must be an enabled home card`);
}
assert.match(home,/<a class="page-card" href="\/gbt27930">\s*<span class="card-state">2015离线<\/span>\s*<h2>27930解析<\/h2>/,'27930 home entry must say 2015 offline rather than generally available');
assert.match(home,/<a class="page-card" href="\/j1939">\s*<span class="card-state">基础离线<\/span>\s*<h2>J1939分析<\/h2>/,'J1939 home entry must say basic offline rather than generally available');
for(const title of ['在线连接','友情链接']){
  const pattern=new RegExp(`<article[^>]+(?:pending|disabled)[^>]*[\\s\\S]*?${title}`);
  assert.match(home,pattern,`${title} must be a disabled gray home card`);
}
assert.match(offline,/id="topNav" class="nav-open nav-fixed"/,'offline analysis must keep the shared navigation fixed and visible');
assert.doesNotMatch(offline,/data-collapse="hover"/,'offline analysis must not use hover-only navigation');
assert.match(offline,/<span class="nav-item active" aria-current="page">离线分析<\/span>/);
assert.doesNotMatch(home,/id="btnDbc"|id="btnAsc"/,'home must not contain the offline file controls');
assert.match(home,/<footer>[\s\S]*?id="hcommit"[\s\S]*?id="hmodtime"[\s\S]*?<\/footer>/,'home footer must contain the commit and publication time');
assert.match(home,/site-version\.js/,'home must load the version display logic');
const versionJs=fs.readFileSync('public/site-version.js','utf8');
const versionCore=fs.readFileSync('public/site-version-core.mjs','utf8');
const versionSource=versionJs+'\n'+versionCore;
assert.match(versionCore,/slice\(0,\s*8\)/,'home must display the first eight characters of the commit SHA');
assert.doesNotMatch(versionSource,/slice\(-8\)/,'commit display must not keep the last eight characters');
assert.doesNotMatch(versionSource,/new Date\(2000,\s*0,\s*1/,'publication time must not start at the 2000-01-01 placeholder');
assert.match(versionCore,/committedAt/,'a complete manifest must supply the commit timestamp');
assert.match(versionCore,/committer/,'an incomplete manifest may use the GitHub committer timestamp');
assert.match(versionJs,/\/version\.json/,'home must read the same-origin version manifest');
assert.match(versionJs,/api\.github\.com\/repos\/Wang106\/CANAnalysis\/commits\//,'GitHub remains available when the manifest is incomplete');
assert.doesNotMatch(versionSource,/commits\/main'/,'GitHub main must not replace a deployed manifest');
assert.match(versionCore,/generatedAt/,'build time stays separate from the commit timestamp');
assert.match(versionCore,/发布/,'publication time must display the commit date without hours, minutes or seconds');
assert.doesNotMatch(versionSource,/timeStr|getHours|getMinutes|getSeconds/,'publication date must not generate a time-of-day string');
assert.doesNotMatch(versionSource,/check-runs|latestSuccessfulDeployment|completed_at/,'publication time must no longer depend on deployment completion');
assert.doesNotMatch(offline,/id="hcommit"|id="hmodtime"/,'offline header must no longer display version information');
assert.match(offline,/<div id="sigBar" class="collapsed">/,'offline signal selection must start collapsed');
assert.match(offline,/signalPanel\.classList\.remove\('collapsed','resized'\);\s*signalPanel\.classList\.add\('expanded'\);/,'a valid DBC load must automatically expand signal selection');

for(const page of pages){
  const source=fs.readFileSync('public/'+page,'utf8');
  assert.doesNotMatch(source,/J939/,`${page} must rename J939 to J1939`);
  assert.match(source,/>J1939分析</,`${page} must expose J1939 in shared navigation`);
  assert.match(source,/>离线分析</,`${page} must expose the shortened offline navigation label`);
  assert.match(source,/>27930解析</,`${page} must expose the shortened 27930 navigation label`);
  if(page!=='index.html')assert.match(source,/href="\/"[^>]*>首页<\/a>/,`${page} must link back to home`);
}

console.log('PASS: home page, offline route and complete navigation cards');
