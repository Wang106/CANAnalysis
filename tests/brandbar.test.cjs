const fs=require('node:fs');
const assert=require('node:assert/strict');

const sharedPages=['index.html','online.html','convert.html','aboutus.html','privacy.html','terms.html','community-guidelines.html','admin.html'];
for(const page of sharedPages){
  const html=fs.readFileSync('public/'+page,'utf8');
  assert.match(html,/<header class="can-brandbar">\s*<div class="shell can-brandbar-inner">\s*<a class="can-brand" href="\/" aria-label="返回 CANAnalysis 首页">\s*<img src="\/icon\.png" width="34" height="34" alt="">\s*<span>CANAnalysis<small>CAN DATA WORKSPACE<\/small><\/span>\s*<\/a>\s*<\/div>\s*<\/header>/s,page+' must use the shared About-style CANAnalysis brand row');
}

const offline=fs.readFileSync('public/offline.html','utf8');
assert.doesNotMatch(offline,/class="can-brandbar"/,'offline analysis keeps its compact working header');

const css=fs.readFileSync('public/site-nav.css','utf8');
assert.match(css,/\.can-brandbar\{[^}]*border-bottom:[^}]*background:[^}]*backdrop-filter:/s,'shared brand row must retain the About-page glass treatment');
assert.match(css,/\.can-brand img\{[^}]*width:34px[^}]*height:34px/s,'shared brand icon must keep the About-page size');

console.log('PASS: all non-offline pages share the About-style brand row');
