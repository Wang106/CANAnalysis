/* Lightweight 3D-rendered ocean scene for the About page. */
(() => {
  'use strict';

  const canvas=document.getElementById('oceanCanvas');
  if(!canvas)return;
  const context=canvas.getContext('2d');
  if(!context)return;

  const motionQuery=matchMedia('(prefers-reduced-motion: reduce)');
  const pointer={x:0,y:0,active:false};
  const ripples=[];
  const animalPlan=[
    {type:'fish'},{type:'fish'},{type:'fish'},{type:'fish'},
    {type:'fish'},{type:'fish'},{type:'fish'},{type:'fish'},
    {type:'turtle'},{type:'turtle'},{type:'crab'},{type:'crab'}
  ];
  const assetSources={fish:'/ocean-fish.webp',turtle:'/ocean-turtle.webp',crab:'/ocean-crab.webp'};
  const assets={};
  const creatures=[];
  let width=1,height=1,dpr=1,frame=0,lastTime=0,visible=true,tabVisible=!document.hidden,destroyed=false;

  const assetReady=Object.entries(assetSources).map(([type,source])=>new Promise(resolve=>{
    const image=new Image();
    image.decoding='async';
    image.onload=()=>{assets[type]=image;resolve();};
    image.onerror=resolve;
    image.src=source;
  }));
  Promise.all(assetReady).then(()=>draw(performance.now(),0));

  const random=(min,max)=>min+Math.random()*(max-min);
  const createCreatures=()=>{
    creatures.length=0;
    animalPlan.forEach((plan,index)=>{
      const isCrab=plan.type==='crab';
      const direction=index%3===0?-1:1;
      creatures.push({
        ...plan,
        x:random(45,Math.max(46,width-45)),
        y:isCrab?height-random(30,48):random(74,Math.max(75,height-58)),
        vx:direction*random(9,17),
        vy:random(-2,2),
        direction,
        speed:random(10,19),
        size:plan.type==='fish'?random(.76,1.08):plan.type==='turtle'?random(.8,1.05):random(.72,.94),
        phase:random(0,Math.PI*2),
        depth:random(.72,1.05)
      });
    });
  };

  const resize=()=>{
    const rect=canvas.getBoundingClientRect();
    const nextWidth=Math.max(1,Math.round(rect.width));
    const nextHeight=Math.max(1,Math.round(rect.height));
    const oldWidth=width,oldHeight=height;
    width=nextWidth;height=nextHeight;
    dpr=Math.min(devicePixelRatio||1,2);
    canvas.width=Math.round(width*dpr);
    canvas.height=Math.round(height*dpr);
    context.setTransform(dpr,0,0,dpr,0,0);
    if(!creatures.length)createCreatures();
    else creatures.forEach(creature=>{
      creature.x=Math.min(width-18,Math.max(18,creature.x*(width/oldWidth)));
      creature.y=Math.min(height-22,Math.max(60,creature.y*(height/oldHeight)));
      if(creature.type==='crab')creature.y=height-random(30,46);
    });
    draw(performance.now(),0);
  };

  const sceneColors=()=>document.documentElement.dataset.skin==='light'
    ? {sand:'#a98b5f',sandGlow:'#d5bd8e',rock:'#536a72',rockLight:'#82969b',weed:'#176f5b',weedLight:'#27977a',bubble:'rgba(255,255,255,.7)',ripple:'rgba(255,255,255,.82)'}
    : {sand:'#423e35',sandGlow:'#756a4c',rock:'#2e3c46',rockLight:'#50636b',weed:'#16705c',weedLight:'#2fa07b',bubble:'rgba(189,229,246,.3)',ripple:'rgba(153,225,255,.78)'};

  function drawSeaweed(ctx,time,colors){
    const bases=[.05,.1,.17,.78,.84,.92,.96];
    ctx.save();ctx.lineCap='round';
    bases.forEach((ratio,index)=>{
      const baseX=width*ratio;
      const stalks=index%2?2:3;
      for(let stalk=0;stalk<stalks;stalk++){
        const x=baseX+stalk*8;
        const tall=30+((index*13+stalk*9)%42);
        const sway=Math.sin(time*.0011+index+stalk)*7;
        ctx.beginPath();ctx.moveTo(x,height-14);
        ctx.bezierCurveTo(x-8,height-tall*.62,x+sway,height-tall*.62,x+sway*.7,height-tall);
        ctx.strokeStyle=stalk%2?colors.weedLight:colors.weed;
        ctx.lineWidth=3.5-stalk*.45;ctx.globalAlpha=.75;ctx.stroke();
      }
    });
    ctx.restore();
  }

  function drawRocks(ctx,colors){
    const rocks=[[.12,25,28,15],[.2,16,18,10],[.72,18,22,12],[.88,27,34,17],[.95,14,18,10]];
    ctx.save();
    rocks.forEach(([ratio,y,rx,ry],index)=>{
      const gradient=ctx.createRadialGradient(width*ratio-rx*.35,height-y-ry*.4,2,width*ratio,height-y,rx);
      gradient.addColorStop(0,colors.rockLight);gradient.addColorStop(1,colors.rock);
      ctx.fillStyle=gradient;ctx.beginPath();ctx.ellipse(width*ratio,height-y,rx,ry,-.12+(index%3)*.11,0,Math.PI*2);ctx.fill();
    });
    ctx.restore();
  }

  function drawSeabed(ctx,time,colors){
    const sand=ctx.createLinearGradient(0,height-54,0,height);
    sand.addColorStop(0,colors.sandGlow);sand.addColorStop(1,colors.sand);
    ctx.beginPath();ctx.moveTo(0,height-30);
    for(let x=0;x<=width+28;x+=28)ctx.lineTo(x,height-29+Math.sin(x*.028+time*.00025)*4);
    ctx.lineTo(width,height);ctx.lineTo(0,height);ctx.closePath();ctx.fillStyle=sand;ctx.globalAlpha=.72;ctx.fill();ctx.globalAlpha=1;
    drawRocks(ctx,colors);
    drawSeaweed(ctx,time,colors);
  }

  const drawBubbles=(ctx,time,colors)=>{
    ctx.strokeStyle=colors.bubble;ctx.lineWidth=1;
    for(let index=0;index<11;index++){
      const x=(index*83+31)%Math.max(width,1);
      const y=(height-((time*.014+index*47)%(height+40)))+20;
      ctx.beginPath();ctx.arc(x,y,1.5+(index%3),0,Math.PI*2);ctx.stroke();
    }
  };

  const drawFallback=(ctx,creature)=>{
    const scale=creature.type==='turtle'?1.2:(creature.type==='crab'?0.85:1);
    ctx.fillStyle='rgba(125,210,225,.42)';ctx.beginPath();ctx.ellipse(0,0,30*scale,14*scale,0,0,Math.PI*2);ctx.fill();
  };

  const drawCreature=(ctx,creature,time)=>{
    const image=assets[creature.type];
    const flip=creature.vx<0?-1:1;
    const base=creature.type==='fish'?78:creature.type==='turtle'?104:72;
    const drawWidth=base*creature.size*creature.depth;
    const ratio=image?.naturalWidth&&image?.naturalHeight?image.naturalHeight/image.naturalWidth:.68;
    const drawHeight=drawWidth*ratio;
    ctx.save();ctx.translate(creature.x,creature.y);ctx.scale(flip,1);
    ctx.rotate(Math.sin(time*.0015+creature.phase)*.035+creature.vy*.004);
    ctx.globalAlpha=.72+creature.depth*.2;
    ctx.shadowColor='rgba(3,18,27,.35)';ctx.shadowBlur=9;ctx.shadowOffsetY=4;
    if(image?.complete&&image.naturalWidth)ctx.drawImage(image,-drawWidth/2,-drawHeight/2,drawWidth,drawHeight);
    else drawFallback(ctx,creature);
    ctx.restore();
  };

  const drawRipples=(ctx,time,colors)=>{
    for(let index=ripples.length-1;index>=0;index--){
      const age=Math.max(0,(time-ripples[index].born)/1000);
      if(age>1.35){ripples.splice(index,1);continue;}
      const progress=age/1.35;
      ctx.save();ctx.strokeStyle=colors.ripple;ctx.lineWidth=2-progress;ctx.globalAlpha=(1-progress)*.8;
      for(let ring=0;ring<3;ring++){
        const radius=Math.max(2,(progress-ring*.1)*68);
        if(radius<=2)continue;
        ctx.beginPath();ctx.ellipse(ripples[index].x,ripples[index].y,radius,radius*.38,0,0,Math.PI*2);ctx.stroke();
      }
      ctx.restore();
    }
  };

  const updateCreature=(creature,elapsed,time)=>{
    const isCrab=creature.type==='crab';
    const dx=pointer.x-creature.x,dy=pointer.y-creature.y,distance=Math.hypot(dx,dy);
    if(pointer.active&&distance<180&&distance>8){
      const pull=(1-distance/180)*(isCrab?15:30);
      creature.vx+=(dx/distance)*pull*elapsed;creature.vy+=(dy/distance)*pull*elapsed;
    }else{
      const cruise=creature.direction*creature.speed;
      creature.vx+=(cruise-creature.vx)*elapsed*.55;
      creature.vy+=Math.sin(time*.0014+creature.phase)*elapsed*2;
    }
    const maxSpeed=pointer.active?40:24;
    const speed=Math.hypot(creature.vx,creature.vy);
    if(speed>maxSpeed){creature.vx=creature.vx/speed*maxSpeed;creature.vy=creature.vy/speed*maxSpeed;}
    creature.x+=creature.vx*elapsed;creature.y+=creature.vy*elapsed;
    if(creature.x>width+55)creature.x=-55;
    if(creature.x<-55)creature.x=width+55;
    if(isCrab){creature.y+=(height-37-creature.y)*elapsed*1.8;creature.y=Math.min(height-22,Math.max(height-58,creature.y));}
    else{
      if(creature.y<58){creature.y=58;creature.vy=Math.abs(creature.vy);}
      if(creature.y>height-52){creature.y=height-52;creature.vy=-Math.abs(creature.vy);}
    }
  };

  function draw(time,elapsed){
    context.clearRect(0,0,width,height);
    const colors=sceneColors();
    drawBubbles(context,time,colors);
    drawSeabed(context,time,colors);
    creatures.forEach(creature=>{if(elapsed)updateCreature(creature,elapsed,time);drawCreature(context,creature,time);});
    drawRipples(context,time,colors);
  }

  const shouldAnimate=()=>visible&&tabVisible&&!motionQuery.matches&&!destroyed;
  const animate=time=>{
    if(!shouldAnimate()){frame=0;lastTime=0;draw(time,0);return;}
    const elapsed=lastTime?Math.min((time-lastTime)/1000,.034):0;
    lastTime=time;draw(time,elapsed);frame=requestAnimationFrame(animate);
  };
  const syncAnimation=()=>{
    if(shouldAnimate()&&!frame)frame=requestAnimationFrame(animate);
    else if(!shouldAnimate()&&frame){cancelAnimationFrame(frame);frame=0;lastTime=0;draw(performance.now(),0);}
  };

  const setPointer=(event,active=true)=>{
    const rect=canvas.getBoundingClientRect();
    pointer.x=event.clientX-rect.left;pointer.y=event.clientY-rect.top;pointer.active=active;
  };
  canvas.addEventListener('pointerenter',event=>{if(event.pointerType!=='touch')setPointer(event);});
  canvas.addEventListener('pointermove',event=>{if(event.pointerType!=='touch'||event.buttons)setPointer(event);});
  canvas.addEventListener('pointerleave',()=>{pointer.active=false;});
  canvas.addEventListener('pointerdown',event=>setPointer(event));
  canvas.addEventListener('pointerup',()=>{pointer.active=false;});
  canvas.addEventListener('pointercancel',()=>{pointer.active=false;});
  canvas.addEventListener('click',event=>{
    const rect=canvas.getBoundingClientRect();
    ripples.push({x:event.clientX-rect.left,y:event.clientY-rect.top,born:performance.now()});
    if(motionQuery.matches)draw(performance.now(),0);else syncAnimation();
  });

  const observer=new IntersectionObserver(entries=>{visible=entries[0]?.isIntersecting!==false;syncAnimation();},{rootMargin:'80px'});
  observer.observe(canvas);
  document.addEventListener('visibilitychange',()=>{tabVisible=!document.hidden;syncAnimation();});
  document.addEventListener('siteskinchange',()=>draw(performance.now(),0));
  const motionChanged=()=>syncAnimation();
  if(motionQuery.addEventListener)motionQuery.addEventListener('change',motionChanged);else motionQuery.addListener(motionChanged);
  const resizeObserver=new ResizeObserver(resize);resizeObserver.observe(canvas);resize();syncAnimation();

  window.__aboutOcean={
    get creatureCount(){return creatures.length;},
    get rippleCount(){return ripples.length;},
    get reducedMotion(){return motionQuery.matches;},
    get pointerActive(){return pointer.active;},
    get running(){return Boolean(frame);},
    destroy(){destroyed=true;syncAnimation();observer.disconnect();resizeObserver.disconnect();}
  };
})();
