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

// CAN 页：初始同样固定；只有生成曲线调用 collapse 后才进入可收回模式。
const charts=fixture(code,'charts');charts.advance(5000);assert(charts.open());assert(charts.fixed());
charts.fire(charts.nav,'pointerleave',{pointerType:'mouse'});assert(charts.open());
assert.equal(typeof charts.api?.collapse,'function');charts.api.collapse();assert(!charts.open());assert(!charts.fixed());assert(charts.links.inert);assert(charts.nav.classList.has('nav-sweep'));
charts.fire(charts.nav,'pointerenter',{pointerType:'mouse'});assert(charts.open());assert(!charts.links.inert);charts.fire(charts.nav,'pointerleave',{pointerType:'mouse'});assert(!charts.open());
charts.fire(charts.nav,'click');assert(charts.open());charts.fire(charts.root,'pointerdown',{target:{},pointerType:'touch'});assert(!charts.open());
charts.fire(charts.nav,'click');charts.doc.activeElement=charts.link;charts.fire(charts.nav,'focusout',{relatedTarget:{}});assert(!charts.open());assert.equal(charts.doc.activeElement,charts.trigger);
console.log('PASS: fixed navigation on ordinary pages and chart-triggered collapse on CAN page');
