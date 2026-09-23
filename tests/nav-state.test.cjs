const fs=require('fs'),vm=require('vm'),assert=require('node:assert/strict');
function fixture(code,collapseMode=''){
 const listeners=new Map(),timers=new Map();let now=0,next=1;
 const root={},classes=new Set(['nav-open']),nav={dataset:collapseMode?{collapse:collapseMode}:{},classList:classes},trigger={},links={},link={};
 const add=Set.prototype.add.bind(classes),remove=Set.prototype.delete.bind(classes);nav.classList.contains=classes.has.bind(classes);nav.classList.add=(...names)=>names.forEach(add);nav.classList.remove=(...names)=>names.forEach(remove);
 for(const el of [root,nav,trigger,links,link]){el.addEventListener=(type,fn)=>{const key=listeners.get(el)||{};(key[type]??=[]).push(fn);listeners.set(el,key)};el.setAttribute=(key,val)=>el[key]=val;}
 nav.contains=el=>[nav,trigger,links,link].includes(el);links.contains=el=>[links,link].includes(el);
 nav.querySelector=sel=>sel==='.nav-peek'?trigger:links;
 const doc={...root,activeElement:null,readyState:'complete',getElementById:()=>nav};doc.addEventListener=root.addEventListener;
 function fire(el,type,props={}){for(const fn of listeners.get(el)?.[type]||[])fn({target:el,relatedTarget:null,preventDefault(){},...props});}
 trigger.focus=()=>{doc.activeElement=trigger;fire(nav,'focusin',{target:trigger});};
 const win={addEventListener:root.addEventListener};
 vm.runInNewContext(code,{document:doc,window:win,setTimeout:(fn,delay)=>{const id=next++;timers.set(id,{fn,time:now+delay});return id},clearTimeout:id=>timers.delete(id)});
 const advance=ms=>{now+=ms;for(const [id,timer] of [...timers])if(timer.time<=now){timers.delete(id);timer.fn();}};
 return {nav,trigger,links,doc,link,fire,advance,root,api:win.__siteNav,open:()=>classes.has('nav-open'),fixed:()=>classes.has('nav-fixed')};
}
const code=fs.readFileSync('public/site-nav.js','utf8');

// 普通页面：始终占据完整高度，任何离开、外部点击或计时都不应收回。
const fixed=fixture(code);fixed.advance(5000);assert(fixed.open());assert(fixed.fixed());assert(!fixed.links.inert);
fixed.fire(fixed.nav,'pointerleave',{pointerType:'mouse'});fixed.fire(fixed.root,'pointerdown',{target:{},pointerType:'touch'});fixed.fire(fixed.nav,'keydown',{key:'Escape'});assert(fixed.open());assert(fixed.fixed());

const offline=fs.readFileSync('public/offline.html','utf8');
assert.match(offline,/id="topNav" class="nav-open nav-fixed"/,'offline page must use the same fixed navigation as other pages');
assert.doesNotMatch(offline,/data-collapse="hover"/,'offline page must not collapse navigation on pointer exit');
assert.match(offline,/canalyzer-visible-limit[\s\S]*?--canalyzer-visible-count[\s\S]*?Math\.min\(charts\.length,10\)/,'CANalyzer view must show at most ten chart rows before vertical scrolling');
assert.match(offline,/if\(renderCount>0\) enterFullscreen\('charts'\)/,'chart generation must automatically maximize the chart workspace');
assert.match(offline,/#content\.fullscreen\{position:fixed;inset:0;z-index:150/,'maximized charts must fill the browser viewport above the navigation');
assert.match(offline,/body\.fs-on\{overflow:hidden/,'maximized charts must lock background page scrolling');
console.log('PASS: fixed navigation and automatic full-viewport charts with a ten-chart CANalyzer limit');
