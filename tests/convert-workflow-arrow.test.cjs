const fs=require('node:fs');
const assert=require('node:assert/strict');

const html=fs.readFileSync('public/convert.html','utf8');
const css=fs.readFileSync('public/convert.css','utf8');

assert.match(html,/class="conversion-flow"[\s\S]*?class="workflow-arrow"[^>]*aria-hidden="true"[^>]*>➜<\/span>[\s\S]*?id="sourceAccordion"[\s\S]*?id="formatAccordion"[\s\S]*?id="csvAccordion"/,'the opening guide arrow must precede steps 01, 02 and 03');
assert.match(css,/\.workflow-arrow\{[^}]*border-radius:50%[^}]*offset-path:path\("M 14 33[^}]*animation:workflow-arrow-guide 3\.8s/s,'the visible guide arrow must follow a curved path beside the three workflow rows');
assert.match(css,/@keyframes workflow-arrow-guide\{[^}]*offset-distance:0[\s\S]*offset-distance:100%/,'the arrow must travel from step 01 through step 02 to step 03 once');
assert.match(css,/@media\(prefers-reduced-motion:reduce\)\{\.workflow-arrow\{display:none\}\}/,'the opening animation must respect reduced-motion preferences');

console.log('PASS: format conversion opening arrow guides users from 01 through 02 to 03');
