const fs=require('node:fs');
const assert=require('node:assert/strict');

const html=fs.readFileSync('public/aboutus.html','utf8');
const navCss=fs.readFileSync('public/site-nav.css','utf8');
const ocean=fs.readFileSync('public/about-ocean.js','utf8');
const oceanLoader=fs.readFileSync('public/about-ocean-loader.js','utf8');
const i18n=fs.readFileSync('public/site-i18n.js','utf8');

assert.match(html,/href="mailto:whf969@foxmail\.com"/,'about page must expose a clickable contact email');
assert.match(html,/<h1 id="hero-title">让 CAN 报文更容易看懂<\/h1>/,'about title must remain on one line');
assert.match(html,/如在使用过程中遇到问题，或有功能建议与其他需求/,'about page must explain when to use the contact email');
assert.match(i18n,/If you encounter a problem or have a feature request/,'contact guidance must support English');

const supportTitle=html.indexOf('支持这个小工具');
const supportNote=html.indexOf('如果它帮你节省了排查时间');
const contactNote=html.indexOf('class="contact-note"');
const payGrid=html.indexOf('class="pay-grid"');
const supportButton=html.lastIndexOf('>支持本站<');
assert.ok(supportTitle>=0&&supportNote>supportTitle&&supportNote<payGrid,'support guidance must sit directly below the support title');
assert.ok(contactNote>=0&&supportButton>contactNote&&supportButton<payGrid,'support button must sit directly below the contact guidance and above the payment area');
assert.match(html,/<button type="button" id="supportButton" class="secondary-link">支持本站<\/button>/,'support control must not add a persistent URL anchor');
assert.match(html,/supportButton[^\n]+addEventListener\(['"]click['"][\s\S]*?support[^\n]+scrollIntoView/,'support button must reveal the payment section without writing a URL hash');
assert.match(html,/#support[^\n]+history\.replaceState/,'legacy support hashes must be removed without changing the current scroll position');
assert.match(html,/navigation\?\.type===['"]reload['"]/,'about page must distinguish a reload from ordinary navigation');
assert.match(html,/sessionStorage\.setItem\(scrollKey[\s\S]*?y:scrollY/,'about page must remember its scroll position before reload');
assert.match(html,/history\.scrollRestoration=['"]manual['"][\s\S]*?scrollTo\(0,saved\.y\)/,'about page must explicitly restore the saved position after reload');
assert.doesNotMatch(html,/请在付款前核对收款方信息/,'obsolete payment-recipient warning must be removed');
assert.doesNotMatch(html,/移动鼠标，附近的动物会慢慢靠近你/,'ocean interaction hint must be removed');

assert.match(html,/<section class="ocean-scene"[^>]+aria-labelledby="ocean-title"/,'support area must include an accessible ocean scene');
assert.match(html,/<canvas id="oceanCanvas"[^>]+aria-hidden="true"/,'ocean animation must be decorative to assistive technology');
assert.match(html,/<script src="about-ocean-loader\.js" defer><\/script>/,'ocean animation must use the page-ready lazy loader');
assert.match(oceanLoader,/addEventListener\(['"]load['"]/,'ocean assets must load only after the About page has opened');
assert.match(oceanLoader,/requestIdleCallback/,'ocean loading must avoid competing with the initial page render');
assert.match(ocean,/IntersectionObserver/,'ocean animation must pause while off screen');
assert.match(ocean,/visibilitychange/,'ocean animation must pause in a background tab');
assert.match(ocean,/prefers-reduced-motion:\s*reduce/,'ocean animation must support reduced motion');
assert.match(ocean,/Math\.min\(devicePixelRatio\s*\|\|\s*1,\s*2\)/,'canvas pixel density must be capped for mobile performance');
assert.match(ocean,/pointerenter|pointerdown/,'nearby animals must react to mouse and touch pointers');
assert.match(ocean,/['"](?:fish|turtle|crab)['"]/,'scene must contain multiple animal types');
assert.match(html,/ocean-cartoon-bg-v2\.jpg/,'ocean scene must use the brighter painted background');
for(const asset of ['ocean-fish-v2.png','ocean-turtle-v2.png','ocean-crab-v2.png'])assert.match(oceanLoader,new RegExp(asset.replace('.','\\.')),'lazy loader must preload '+asset);
assert.match(ocean,/drawCreature/,'animals must share smooth image-led motion rendering');
assert.match(ocean,/drawCaustics/,'ocean scene must include animated underwater light');
assert.match(ocean,/drawGrass/,'ocean scene must include animated foreground seaweed');
assert.match(ocean,/ripples/,'ocean scene must track click ripples');
assert.match(ocean,/addEventListener\(['"]click['"]/,'clicking the ocean scene must create a ripple');
assert.match(ocean,/maxRadius:Math\.hypot/,'click ripples must calculate enough radius to cover the entire canvas');
assert.match(ocean,/ctx\.arc\(ripple\.x,ripple\.y,ringProgress\*ripple\.maxRadius/,'click ripples must expand as circles on the screen plane');
assert.match(ocean,/easeInOut/,'motion must use eased timing rather than rigid linear steps');
assert.match(ocean,/breatheX=1\+wave/,'fish motion must include organic body deformation');
assert.match(ocean,/shear=Math\.sin/,'turtle motion must include a soft swimming shear');
assert.match(ocean,/Math\.abs\(wave\)/,'crab motion must include a softened walking bounce');
for(const asset of ['ocean-cartoon-bg-v2.jpg','ocean-fish-v2.png','ocean-turtle-v2.png','ocean-crab-v2.png']){
  const file='public/'+asset;assert.equal(fs.existsSync(file),true,asset+' must exist');assert.ok(fs.statSync(file).size>100000,asset+' must not be an empty placeholder');
}

assert.match(navCss,/\.skin-face\{[^}]*border:0[^}]*background:transparent/,'skin selector must sit transparently on the navigation');
assert.match(navCss,/\.language-face\{[^}]*border:0[^}]*background:transparent/,'language selector must sit transparently on the navigation');
assert.match(navCss,/\.skin-face::after,\.language-face::after\{content:"⌄"/,'transparent selectors must retain a dropdown cue');

console.log('PASS: support layout and hand-drawn interactive ocean scene');
