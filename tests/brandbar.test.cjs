const fs=require('node:fs');
const assert=require('node:assert/strict');

const sharedPages=['index.html','online.html','convert.html','aboutus.html','privacy.html','terms.html','community-guidelines.html','admin.html'];
for(const page of sharedPages){
  const html=fs.readFileSync('public/'+page,'utf8');
  assert.match(html,/<header class="can-brandbar">\s*<div class="shell can-brandbar-inner">\s*<a class="can-brand" href="\/" aria-label="返回 CANAnalysis 首页">\s*<img src="\/icon\.png" width="34" height="34" alt="">\s*<span>CANAnalysis<small>CAN DATA WORKSPACE<\/small><\/span>\s*<\/a>\s*<\/div>\s*<\/header>/s,page+' must use the shared About-style CANAnalysis brand row');
}

const offline=fs.readFileSync('public/offline.html','utf8');
assert.match(offline,/<div class="header-left">\s*<a class="can-brand" href="\/" aria-label="返回 CANAnalysis 首页">\s*<img src="\/icon\.png" width="34" height="34" alt="">\s*<span>CANAnalysis<small>CAN DATA WORKSPACE<\/small><\/span>\s*<\/a>\s*<\/div>/s,'offline analysis must use the exact shared CANAnalysis brand inside its working header');
assert.match(offline,/<div class="header-right">[\s\S]*?id="btnDbc"[\s\S]*?id="btnAsc"/,'offline analysis must retain both file-loading rows beside the shared brand');

const css=fs.readFileSync('public/site-nav.css','utf8');
assert.match(css,/\.can-brandbar\{[^}]*border-bottom:[^}]*background:[^}]*backdrop-filter:/s,'shared brand row must retain the About-page glass treatment');
assert.match(css,/\.can-brandbar-inner\{[^}]*width:min\(1120px,calc\(100% - 40px\)\)[^}]*height:62px[^}]*margin:0 auto[^}]*padding:0/s,'shared brand row must own the exact Home width, height and alignment instead of inheriting page shells');
assert.match(css,/\.can-brand>span\{[^}]*font-size:16px[^}]*line-height:18px[^}]*letter-spacing:\.3px/s,'shared brand title typography must be explicit and identical on every page');
assert.match(css,/\.can-brand img\{[^}]*width:34px[^}]*height:34px/s,'shared brand icon must keep the About-page size');

console.log('PASS: every page uses the shared CANAnalysis brand while offline retains its file controls');
