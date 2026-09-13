const fs=require('fs'),vm=require('vm'),assert=require('node:assert/strict');
function fixture(code){
 const listeners=new Map(),timers=new Map();let now=0,next=1;
 const root={},nav={classList:new Set(['nav-open'])},trigger={},links={},link={};
 nav.classList.contains=nav.classList.has.bind(nav.classList);
 const origDelete=nav.classList.delete.bind(nav.classList);nav.classList.remove=(...names)=>names.forEach(origDelete);
 for(const el of [root,nav,trigger,links,link]){el.addEventListener=(type,fn)=>{const key=listeners.get(el)||{};(key[type]??=[]).push(fn);listeners.set(el,key)};el.setAttribute=(key,val)=>el[key]=val;}
 nav.contains=el=>[nav,trigger,links,link].includes(el);links.contains=el=>[links,link].includes(el);
 nav.querySelector=sel=>sel==='.nav-peek'?trigger:links;
 const doc={...root,activeElement:null,readyState:'complete',getElementById:()=>nav};
 doc.addEventListener=root.addEventListener;
 function fire(el,type,props={}){for(const fn of listeners.get(el)?.[type]||[])fn({target:el,relatedTarget:null,preventDefault(){},...props});}
 trigger.focus=()=>{doc.activeElement=trigger;fire(nav,'focusin',{target:trigger});};
 const win={addEventListener:root.addEventListener};
 vm.runInNewContext(code,{document:doc,window:win,setTimeout:(fn,delay)=>{const id=next++;timers.set(id,{fn,time:now+delay});return id},clearTimeout:id=>timers.delete(id)});
 const advance=ms=>{now+=ms;for(const [id,timer] of [...timers])if(timer.time<=now){timers.delete(id);timer.fn()}};
 return {nav,trigger,links,doc,link,fire,advance,root,open:()=>nav.classList.has('nav-open')};
}
const f=fixture(fs.readFileSync('public/site-nav.js','utf8'));
assert(f.open());f.advance(999);assert(f.open());f.advance(1);assert(!f.open());assert(f.links.inert);assert(f.nav.classList.has('nav-sweep'));
f.fire(f.nav,'pointerenter',{pointerType:'mouse'});assert(f.open());assert(!f.links.inert);f.fire(f.nav,'pointerleave',{pointerType:'mouse'});assert(!f.open());
f.fire(f.nav,'click');assert(f.open());f.fire(f.root,'pointerdown',{target:{},pointerType:'touch'});assert(!f.open());
f.fire(f.nav,'click');f.doc.activeElement=f.link;f.fire(f.nav,'pointerleave',{pointerType:'mouse'});assert(!f.open());assert.equal(f.doc.activeElement,f.trigger);
f.fire(f.nav,'focusin');assert(f.open());f.fire(f.root,'click',{target:{}});assert(!f.open());
f.fire(f.nav,'click');f.fire(f.nav,'keydown',{key:'Escape'});assert(!f.open());
f.fire(f.nav,'click');f.fire(f.nav,'focusout',{relatedTarget:f.link});assert(f.open());f.fire(f.nav,'focusout',{relatedTarget:{}});assert(!f.open());
const g=fixture(fs.readFileSync('public/site-nav.js','utf8'));g.advance(500);g.fire(g.nav,'pointerenter',{pointerType:'mouse'});g.advance(1000);assert(g.open());
console.log('PASS: startup timing, sweep, mouse, touch/outside, focus dismissal, Escape, keyboard focus and timer cancellation');
