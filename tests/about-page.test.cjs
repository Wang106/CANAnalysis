const fs=require('node:fs');
const assert=require('node:assert/strict');

const html=fs.readFileSync('public/aboutus.html','utf8');
const navCss=fs.readFileSync('public/site-nav.css','utf8');
const ocean=fs.readFileSync('public/about-ocean.js','utf8');
const i18n=fs.readFileSync('public/site-i18n.js','utf8');

assert.match(html,/href="mailto:whf969@foxmail\.com"/,'about page must expose a clickable contact email');
assert.match(html,/如在使用过程中遇到问题，或有功能建议与其他需求/,'about page must explain when to use the contact email');
assert.match(i18n,/If you encounter a problem or have a feature request/,'contact guidance must support English');

assert.match(html,/<section class="ocean-scene"[^>]+aria-labelledby="ocean-title"/,'support area must include an accessible ocean scene');
assert.match(html,/<canvas id="oceanCanvas"[^>]+aria-hidden="true"/,'ocean animation must be decorative to assistive technology');
assert.match(html,/<script src="about-ocean\.js" defer><\/script>/,'ocean behavior must be isolated from the page');
assert.match(ocean,/IntersectionObserver/,'ocean animation must pause while off screen');
assert.match(ocean,/visibilitychange/,'ocean animation must pause in a background tab');
assert.match(ocean,/prefers-reduced-motion:\s*reduce/,'ocean animation must support reduced motion');
assert.match(ocean,/Math\.min\(devicePixelRatio\s*\|\|\s*1,\s*2\)/,'canvas pixel density must be capped for mobile performance');
assert.match(ocean,/pointerenter|pointerdown/,'nearby animals must react to mouse and touch pointers');
assert.match(ocean,/type:\s*['"](?:fish|turtle|crab)/,'scene must contain multiple animal types');

assert.match(navCss,/\.skin-face\{[^}]*border:0[^}]*background:transparent/,'skin selector must sit transparently on the navigation');
assert.match(navCss,/\.language-face\{[^}]*border:0[^}]*background:transparent/,'language selector must sit transparently on the navigation');
assert.match(navCss,/\.skin-face::after,\.language-face::after\{content:"⌄"/,'transparent selectors must retain a dropdown cue');

console.log('PASS: transparent navigation selectors, contact email and efficient ocean scene');
