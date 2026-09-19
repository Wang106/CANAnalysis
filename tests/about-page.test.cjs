const fs=require('node:fs');
const assert=require('node:assert/strict');

const html=fs.readFileSync('public/aboutus.html','utf8');
const navCss=fs.readFileSync('public/site-nav.css','utf8');
const ocean=fs.readFileSync('public/about-ocean.js','utf8');
const i18n=fs.readFileSync('public/site-i18n.js','utf8');

assert.match(html,/href="mailto:whf969@foxmail\.com"/,'about page must expose a clickable contact email');
assert.match(html,/如在使用过程中遇到问题，或有功能建议与其他需求/,'about page must explain when to use the contact email');
assert.match(i18n,/If you encounter a problem or have a feature request/,'contact guidance must support English');

const supportTitle=html.indexOf('支持这个小工具');
const supportNote=html.indexOf('如果它帮你节省了排查时间');
const payGrid=html.indexOf('class="pay-grid"');
const supportButton=html.lastIndexOf('>支持本站<');
assert.ok(supportTitle>=0&&supportNote>supportTitle&&supportNote<payGrid,'support guidance must sit directly below the support title');
assert.ok(supportButton>payGrid,'support button must sit below the payment QR codes');
assert.match(html,/<button type="button" id="supportButton" class="secondary-link">支持本站<\/button>/,'support control must not add a persistent URL anchor');
assert.match(html,/#support[^\n]+history\.replaceState/,'legacy support hashes must be removed without changing the current scroll position');
assert.doesNotMatch(html,/请在付款前核对收款方信息/,'obsolete payment-recipient warning must be removed');
assert.doesNotMatch(html,/移动鼠标，附近的动物会慢慢靠近你/,'ocean interaction hint must be removed');

assert.match(html,/<section class="ocean-scene"[^>]+aria-labelledby="ocean-title"/,'support area must include an accessible ocean scene');
assert.match(html,/<canvas id="oceanCanvas"[^>]+aria-hidden="true"/,'ocean animation must be decorative to assistive technology');
assert.match(html,/<script src="about-ocean\.js" defer><\/script>/,'ocean behavior must be isolated from the page');
assert.match(ocean,/IntersectionObserver/,'ocean animation must pause while off screen');
assert.match(ocean,/visibilitychange/,'ocean animation must pause in a background tab');
assert.match(ocean,/prefers-reduced-motion:\s*reduce/,'ocean animation must support reduced motion');
assert.match(ocean,/Math\.min\(devicePixelRatio\s*\|\|\s*1,\s*2\)/,'canvas pixel density must be capped for mobile performance');
assert.match(ocean,/pointerenter|pointerdown/,'nearby animals must react to mouse and touch pointers');
assert.match(ocean,/type:\s*['"](?:fish|turtle|crab)/,'scene must contain multiple animal types');
assert.match(ocean,/ocean-fish\.webp/,'ocean scene must render a 3D fish asset');
assert.match(ocean,/ocean-turtle\.webp/,'ocean scene must render a 3D turtle asset');
assert.match(ocean,/ocean-crab\.webp/,'ocean scene must render a 3D crab asset');
assert.match(ocean,/drawSeabed/,'ocean scene must include a seabed');
assert.match(ocean,/drawSeaweed/,'ocean scene must include seaweed');
assert.match(ocean,/ripples/,'ocean scene must track click ripples');
assert.match(ocean,/addEventListener\(['"]click['"]/,'clicking the ocean scene must create a ripple');
for(const asset of ['ocean-fish.webp','ocean-turtle.webp','ocean-crab.webp']){
  assert.equal(fs.existsSync('public/'+asset),true,asset+' must exist');
}

assert.match(navCss,/\.skin-face\{[^}]*border:0[^}]*background:transparent/,'skin selector must sit transparently on the navigation');
assert.match(navCss,/\.language-face\{[^}]*border:0[^}]*background:transparent/,'language selector must sit transparently on the navigation');
assert.match(navCss,/\.skin-face::after,\.language-face::after\{content:"⌄"/,'transparent selectors must retain a dropdown cue');

console.log('PASS: support layout, transparent selectors and 3D interactive ocean scene');
