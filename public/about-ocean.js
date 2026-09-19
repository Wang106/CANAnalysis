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
  const seaweedClusters=[.025,.065,.11,.165,.225,.31,.69,.755,.815,.875,.93,.975];
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
    ctx.save();ctx.lineCap='round';
    seaweedClusters.forEach((ratio,index)=>{
      const baseX=width*ratio;
      const stalks=3+(index%3);
      for(let stalk=0;stalk<stalks;stalk++){
        const x=baseX+(stalk-(stalks-1)/2)*7;
        const tall=52+((index*17+stalk*13)%72);
        const sway=Math.sin(time*.00105+index*.7+stalk)*12;
        ctx.beginPath();ctx.moveTo(x,height-14);
        ctx.bezierCurveTo(x-11,height-tall*.62,x+sway,height-tall*.58,x+sway*.78,height-tall);
        ctx.strokeStyle=stalk%2?colors.weedLight:colors.weed;
        ctx.lineWidth=Math.max(2.2,4.5-stalk*.38);ctx.globalAlpha=.78;ctx.stroke();
        for(const leafAt of [.42,.68]){
          const leafY=height-14-tall*leafAt;
          const leafX=x+sway*leafAt*.62;
          const side=(stalk+Math.round(leafAt*10))%2?-1:1;
          ctx.beginPath();ctx.moveTo(leafX,leafY);
          ctx.quadraticCurveTo(leafX+side*13,leafY-8,leafX+side*18,leafY-2);
          ctx.strokeStyle=stalk%2?colors.weed:colors.weedLight;ctx.lineWidth=2.4;ctx.stroke();
        }
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

  function drawTurtleFlippers(ctx,creature,time,drawWidth,drawHeight){
    const glide=Math.sin(time*.0021+creature.phase*.7);
    const gradient=ctx.createLinearGradient(0,-drawHeight*.5,0,drawHeight*.7);
    gradient.addColorStop(0,'#7e8f55');gradient.addColorStop(.48,'#536b43');gradient.addColorStop(1,'#273f32');
    const flippers=[
      {x:-.2,y:-.18,angle:-1.72,amplitude:.42,length:.5,phase:0},
      {x:.18,y:-.16,angle:-.42,amplitude:.42,length:.56,phase:Math.PI},
      {x:-.28,y:.2,angle:2.25,amplitude:.24,length:.38,phase:Math.PI},
      {x:.2,y:.2,angle:.74,amplitude:.24,length:.4,phase:0}
    ];
    ctx.fillStyle=gradient;ctx.strokeStyle='rgba(198,208,137,.72)';ctx.lineWidth=1;
    flippers.forEach(flipper=>{
      const flap=Math.sin(time*.0052+creature.phase+flipper.phase)*flipper.amplitude+glide*.08;
      const length=drawWidth*flipper.length;
      const thickness=drawHeight*(flipper.length>.45?.24:.19);
      ctx.save();ctx.translate(drawWidth*flipper.x,drawHeight*flipper.y);ctx.rotate(flipper.angle+flap);
      ctx.beginPath();ctx.moveTo(0,-thickness*.35);
      ctx.bezierCurveTo(length*.28,-thickness,length*.82,-thickness*.48,length,0);
      ctx.bezierCurveTo(length*.7,thickness*.42,length*.22,thickness*.52,0,thickness*.28);
      ctx.closePath();ctx.fill();ctx.stroke();
      ctx.strokeStyle='rgba(214,220,157,.44)';ctx.lineWidth=.7;
      ctx.beginPath();ctx.moveTo(length*.06,0);ctx.quadraticCurveTo(length*.45,-thickness*.08,length*.9,0);ctx.stroke();
      for(const along of [.32,.55,.74]){
        ctx.beginPath();ctx.moveTo(length*along,-thickness*.04);ctx.lineTo(length*(along+.09),-thickness*.34);ctx.stroke();
        ctx.beginPath();ctx.moveTo(length*along,thickness*.03);ctx.lineTo(length*(along+.08),thickness*.25);ctx.stroke();
      }
      ctx.restore();
    });
  }

  function drawAnimatedTurtle(ctx,creature,time,image,drawWidth,drawHeight){
    drawTurtleFlippers(ctx,creature,time,drawWidth,drawHeight);
    if(!(image?.complete&&image.naturalWidth)){drawFallback(ctx,creature);return;}
    const sx=image.naturalWidth*.12,sy=0,sw=image.naturalWidth*.88,sh=image.naturalHeight*.68;
    ctx.drawImage(image,sx,sy,sw,sh,-drawWidth*.42,-drawHeight*.48,drawWidth*.94,drawHeight*.7);
  }

  function drawCrabLegs(ctx,creature,time,drawWidth,drawHeight){
    const walk=time*.007+creature.phase;
    const legGradient=ctx.createLinearGradient(-drawWidth*.7,0,drawWidth*.7,0);
    legGradient.addColorStop(0,'#9f3427');legGradient.addColorStop(.5,'#ed7845');legGradient.addColorStop(1,'#9f3427');
    ctx.strokeStyle=legGradient;ctx.lineWidth=Math.max(2.5,drawWidth*.043);ctx.lineCap='round';ctx.lineJoin='round';
    for(const side of [-1,1]){
      for(let leg=0;leg<4;leg++){
        const step=Math.sin(walk+leg*1.18+(side<0?Math.PI:0));
        const hipX=side*drawWidth*.24,hipY=drawHeight*(-.08+leg*.13);
        const elbowX=side*drawWidth*(.4+leg*.025),elbowY=hipY+drawHeight*(-.03+step*.08);
        const kneeX=side*drawWidth*(.55+leg*.035),kneeY=hipY+drawHeight*(.08+step*.1);
        const footX=side*drawWidth*(.7+leg*.045),footY=hipY+drawHeight*(.25-step*.1);
        ctx.beginPath();ctx.moveTo(hipX,hipY);ctx.lineTo(elbowX,elbowY);ctx.lineTo(kneeX,kneeY);ctx.lineTo(footX,footY);ctx.stroke();
        ctx.fillStyle='#ef8554';ctx.beginPath();ctx.arc(kneeX,kneeY,ctx.lineWidth*.58,0,Math.PI*2);ctx.fill();
      }
      const clawWave=Math.sin(walk*.7+(side<0?Math.PI:0))*.18;
      ctx.save();ctx.translate(side*drawWidth*.29,-drawHeight*.18);ctx.rotate(side*(.64+clawWave));
      ctx.strokeStyle='#e76b3c';ctx.lineWidth=Math.max(3,drawWidth*.055);ctx.beginPath();ctx.moveTo(0,0);ctx.lineTo(side*drawWidth*.24,-drawHeight*.18);ctx.stroke();
      ctx.fillStyle='#d94b2e';ctx.beginPath();ctx.ellipse(side*drawWidth*.3,-drawHeight*.22,drawWidth*.13,drawHeight*.14,side*.4,0,Math.PI*2);ctx.fill();ctx.restore();
    }
  }

  function drawAnimatedCrab(ctx,creature,time,image,drawWidth,drawHeight){
    drawCrabLegs(ctx,creature,time,drawWidth,drawHeight);
    if(!(image?.complete&&image.naturalWidth)){drawFallback(ctx,creature);return;}
    const sx=image.naturalWidth*.18,sy=0,sw=image.naturalWidth*.64,sh=image.naturalHeight*.57;
    ctx.drawImage(image,sx,sy,sw,sh,-drawWidth*.38,-drawHeight*.42,drawWidth*.76,drawHeight*.57);
  }

  const drawCreature=(ctx,creature,time)=>{
    const image=assets[creature.type];
    const flip=creature.vx<0?-1:1;
    const base=creature.type==='fish'?78:creature.type==='turtle'?108:88;
    const drawWidth=base*creature.size*creature.depth;
    const ratio=image?.naturalWidth&&image?.naturalHeight?image.naturalHeight/image.naturalWidth:.68;
    const drawHeight=drawWidth*ratio;
    ctx.save();ctx.translate(creature.x,creature.y);ctx.scale(flip,1);
    ctx.rotate(Math.sin(time*.0015+creature.phase)*.035+creature.vy*.004);
    ctx.globalAlpha=.72+creature.depth*.2;
    ctx.shadowColor='rgba(3,18,27,.35)';ctx.shadowBlur=9;ctx.shadowOffsetY=4;
    if(creature.type==='turtle')drawAnimatedTurtle(ctx,creature,time,image,drawWidth,drawHeight);
    else if(creature.type==='crab')drawAnimatedCrab(ctx,creature,time,image,drawWidth,drawHeight);
    else if(image?.complete&&image.naturalWidth)ctx.drawImage(image,-drawWidth/2,-drawHeight/2,drawWidth,drawHeight);
    else drawFallback(ctx,creature);
    ctx.restore();
  };

  const drawRipples=(ctx,time,colors)=>{
    for(let index=ripples.length-1;index>=0;index--){
      const ripple=ripples[index];
      const age=Math.max(0,(time-ripple.born)/1000);
      if(age>1.8){ripples.splice(index,1);continue;}
      const progress=Math.min(1,age/1.8);
      const eased=1-Math.pow(1-progress,3);
      ctx.save();ctx.strokeStyle=colors.ripple;ctx.lineWidth=Math.max(.7,2.6-progress*1.7);ctx.globalAlpha=(1-progress)*.84;
      for(let ring=0;ring<3;ring++){
        const ringProgress=Math.max(0,eased-ring*.075);
        const radius=ringProgress*ripple.maxRadius;
        if(radius<=2)continue;
        ctx.beginPath();ctx.arc(ripple.x,ripple.y,radius,0,Math.PI*2);ctx.stroke();
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
    const x=event.clientX-rect.left,y=event.clientY-rect.top;
    ripples.push({x,y,born:performance.now(),maxRadius:Math.hypot(Math.max(x,width-x),Math.max(y,height-y))});
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
    get seaweedClusterCount(){return seaweedClusters.length;},
    get latestRippleRadius(){return ripples.at(-1)?.maxRadius||0;},
    get reducedMotion(){return motionQuery.matches;},
    get pointerActive(){return pointer.active;},
    get running(){return Boolean(frame);},
    destroy(){destroyed=true;syncAnimation();observer.disconnect();resizeObserver.disconnect();}
  };
})();
