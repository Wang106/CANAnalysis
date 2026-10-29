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
assert.doesNotMatch(html,/CAN LOG CONVERTER|换一种格式，|继续分析。/,'the format converter intro must be removed');
assert.match(html,/<details id="sourceAccordion" class="conversion-accordion source-accordion" open>/,'the source file section must open by default');
assert.match(html,/<button type="button" class="file-zone" id="dropZone"[^>]*aria-controls="sourceFile"/,'the complete source file zone must be a native keyboard-accessible button');
assert.match(html,/<span id="chooseFile" class="secondary">选择日志文件<\/span>[\s\S]*?<\/button>\s*<input type="file" id="sourceFile"/,'the visual picker label must not create a nested button');
assert.match(js,/\$\('dropZone'\)\.onclick=openSourcePicker/,'clicking anywhere in the source file zone must open the file picker');
const formatCards=html.match(/<div class="format-cards"[\s\S]*?<\/div>/)?.[0]||'';
assert.doesNotMatch(formatCards,/<small>/,'format cards must not include secondary labels');
assert.doesNotMatch(formatCards,/<b>|Vector|BusMaster|PCAN|周立功|ASAM/,'target format buttons must only display extensions');
for(const format of ['asc','log','trc','blf','txt','mf4','mdf'])assert.match(formatCards,new RegExp(`data-format="${format}"[^>]*><span>\\.${format}<\\/span><\\/button>`),`the ${format} target button must only show its extension`);
assert.match(css,/\.format-card\{[^}]*min-height:52px[^}]*padding:7px 6px/,'target format buttons must use the compact layout');
assert.match(html,/class="signal-column-head available-signal-head"><label for="signalSearch">可选信号<\/label><input id="signalSearch"/,'the signal search field must sit directly to the right of Available Signals');
assert.match(css,/\.signal-list\{[^}]*overflow-x:hidden[^}]*overflow-y:auto[^}]*overscroll-behavior:contain[^}]*scrollbar-gutter:stable/,'long signal lists must scroll independently');
assert.match(css,/@media\(max-width:820px\)\{[\s\S]*?\.signal-column\{height:300px;min-height:300px;max-height:300px\}/,'mobile signal columns must keep a bounded scrolling height');
assert.match(html,/class="target-info"><span id="targetExt">\.asc<\/span><\/div>/,'the target panel must only show the selected extension');
assert.doesNotMatch(js,/targetTitle|targetDescription|targetCapability|descriptions=/,'removed target copy must not leave dead DOM updates');
assert.match(css,/\.action-bar p\{[^}]*flex:1[^}]*min-width:0/,'the local-processing note must use the available width before wrapping');
assert.doesNotMatch(html,/compatibilityAccordion|compatibilitySummary|格式与兼容范围说明|关于 MDF\/MF4/,'the compatibility section and all of its contents must be removed');
assert.doesNotMatch(css,/\.compatibility-accordion/,'removed compatibility accordion must not leave component styling');
assert.doesNotMatch(html,/统一转换为 ASC、LOG、TRC、BLF、TXT、MF4 或 MDF|选择信号并按固定时间间隔导出宽表|转换的是原始 CAN 数据帧与远程帧/,'removed helper copy must not remain visible');
const formatSummary=html.match(/<summary id="formatSummary"[\s\S]*?<\/summary>/)?.[0]||'';
assert.match(formatSummary,/class="accordion-action"[\s\S]*?点击展开[\s\S]*?点击收起/,'the format summary must restore expand and collapse labels');

console.log('PASS: format conversion highlights steps 01 through 03 and restores step 02 guidance');
