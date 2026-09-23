const fs=require('node:fs');
const assert=require('node:assert/strict');

const html=fs.readFileSync('public/convert.html','utf8');
const css=fs.readFileSync('public/convert.css','utf8');
const js=fs.readFileSync('public/convert.js','utf8');

assert.match(html,/class="conversion-flow"[\s\S]*?class="workflow-arrow"[^>]*aria-hidden="true"[^>]*>➜<\/span>[\s\S]*?id="sourceAccordion"[\s\S]*?id="formatAccordion"[\s\S]*?id="csvAccordion"/,'the opening guide arrow must precede steps 01, 02 and 03');
assert.match(css,/\.workflow-arrow\{[^}]*border-radius:50%[^}]*offset-path:path\("M 14 33[^}]*animation:workflow-arrow-guide 3\.8s/s,'the visible guide arrow must follow a curved path beside the three workflow rows');
assert.match(css,/@keyframes workflow-arrow-guide\{[^}]*offset-distance:0[\s\S]*offset-distance:100%/,'the arrow must travel from step 01 through step 02 to step 03 once');
assert.match(css,/@media\(prefers-reduced-motion:reduce\)\{\.workflow-arrow\{display:none\}\}/,'the opening animation must respect reduced-motion preferences');
assert.doesNotMatch(html,/01 — 源文件 · 02 — 格式转换 · 03 — 信号 CSV/,'the duplicated workflow sentence must be removed');
assert.doesNotMatch(html,/选择或拖入一个或多个 CAN 日志/,'the redundant source prompt must be removed');
const formatCards=html.match(/<div class="format-cards"[\s\S]*?<\/div>/)?.[0]||'';
assert.doesNotMatch(formatCards,/<small>/,'format cards must not include secondary labels');
assert.match(html,/class="target-info"><span id="targetExt">\.asc<\/span><\/div>/,'the target panel must only show the selected extension');
assert.doesNotMatch(js,/targetTitle|targetDescription|targetCapability|descriptions=/,'removed target copy must not leave dead DOM updates');
assert.match(css,/\.action-bar p\{[^}]*flex:1[^}]*min-width:0/,'the local-processing note must use the available width before wrapping');
assert.match(html,/<th>格式<\/th><th>设备<\/th><th>说明<\/th>[\s\S]*?<td><b>\.asc<\/b><\/td><td>Vector<\/td><td>经典 CAN \/ CAN FD 文本日志<\/td>/,'the compatibility table must use format, device and description columns');

console.log('PASS: format conversion opening arrow guides users from 01 through 02 to 03');
