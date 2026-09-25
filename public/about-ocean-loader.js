/* Load the decorative ocean only after the About page itself is ready. */
(() => {
  'use strict';
  const scene=document.querySelector('.ocean-scene');
  if(!scene)return;
  const sources={
    background:'/ocean-cartoon-bg-v2.jpg',
    fish:'/ocean-fish-v2.png',
    turtle:'/ocean-turtle-v2.png',
    crab:'/ocean-crab-v2.png'
  };
  let started=false;
  const start=()=>{
    if(started)return;started=true;
    const entries=Object.entries(sources);
    Promise.all(entries.map(([name,source])=>new Promise(resolve=>{
      const image=new Image();image.decoding='async';
      image.onload=()=>resolve([name,image]);image.onerror=()=>resolve([name,null]);image.src=source;
    }))).then(items=>{
      window.__aboutOceanAssets=Object.fromEntries(items);
      scene.classList.add('is-ready');
      const script=document.createElement('script');script.src='/about-ocean.js?v=turtle-motion-20260925';script.async=true;document.head.appendChild(script);
    });
  };
  const afterPageLoad=()=>('requestIdleCallback' in window?requestIdleCallback(start,{timeout:900}):setTimeout(start,120));
  if(document.readyState==='complete')afterPageLoad();else addEventListener('load',afterPageLoad,{once:true});
})();
