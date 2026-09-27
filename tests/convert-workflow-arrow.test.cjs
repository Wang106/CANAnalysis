const fs=require('node:fs');
const assert=require('node:assert/strict');

const html=fs.readFileSync('public/convert.html','utf8');
const css=fs.readFileSync('public/convert.css','utf8');
const js=fs.readFileSync('public/convert.js','utf8');

assert.doesNotMatch(html,/workflow-arrow|>➜<\/span>/,'the old arrow guide must be removed');
assert.doesNotMatch(css,/workflow-arrow-guide|offset-path/,'the old arrow path animation must be removed');
assert.match(css,/\.source-heading\{animation:workflow-row-guide 1s ease-out \.12s 1 both\}/,'step 01 must highlight first for one second');
assert.match(css,/\.format-heading\{animation:workflow-row-guide 1s ease-out 1\.12s 1 both\}/,'step 02 must highlight after step 01');
assert.match(css,/\.csv-heading\{animation:workflow-row-guide 1s ease-out 2\.12s 1 both\}/,'step 03 must highlight after step 02');
assert.match(css,/@keyframes workflow-row-guide\{[^}]*box-shadow[\s\S]*var\(--section-accent\)/,'each workflow row must use its own highlight color');
assert.match(css,/@media\(prefers-reduced-motion:reduce\)\{\.workflow-heading\{animation:none\}\}/,'the sequential highlight must respect reduced-motion preferences');
assert.doesNotMatch(html,/01 — 源文件 · 02 — 格式转换 · 03 — 信号 CSV/,'the duplicated workflow sentence must be removed');
assert.doesNotMatch(html,/选择或拖入一个或多个 CAN 日志/,'the redundant source prompt must be removed');
const formatCards=html.match(/<div class="format-cards"[\s\S]*?<\/div>/)?.[0]||'';
assert.doesNotMatch(formatCards,/<small>/,'format cards must not include secondary labels');
assert.match(html,/class="target-info"><span id="targetExt">\.asc<\/span><\/div>/,'the target panel must only show the selected extension');
assert.doesNotMatch(js,/targetTitle|targetDescription|targetCapability|descriptions=/,'removed target copy must not leave dead DOM updates');
assert.match(css,/\.action-bar p\{[^}]*flex:1[^}]*min-width:0/,'the local-processing note must use the available width before wrapping');
assert.match(html,/<th>格式<\/th><th>设备<\/th><th>说明<\/th>[\s\S]*?<td><b>\.asc<\/b><\/td><td>Vector<\/td><td>经典 CAN \/ CAN FD 文本日志<\/td>/,'the compatibility table must use format, device and description columns');
assert.doesNotMatch(html,/统一转换为 ASC、LOG、TRC、BLF、TXT、MF4 或 MDF|选择信号并按固定时间间隔导出宽表|转换的是原始 CAN 数据帧与远程帧/,'removed helper copy must not remain visible');
const formatSummary=html.match(/<summary id="formatSummary"[\s\S]*?<\/summary>/)?.[0]||'';
assert.match(formatSummary,/class="accordion-action"[\s\S]*?点击展开[\s\S]*?点击收起/,'the format summary must restore expand and collapse labels');

console.log('PASS: format conversion highlights steps 01 through 03 and restores step 02 guidance');
