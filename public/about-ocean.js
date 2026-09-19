/* Lightweight decorative ocean scene for the About page. */
(() => {
  'use strict';

  const canvas=document.getElementById('oceanCanvas');
  if(!canvas)return;
  const context=canvas.getContext('2d');
  if(!context)return;

  const motionQuery=matchMedia('(prefers-reduced-motion: reduce)');
  const pointer={x:0,y:0,active:false,kind:'mouse'};
  const animalPlan=[
    {type:'fish',tone:0},{type:'fish',tone:1},{type:'fish',tone:2},{type:'fish',tone:3},
    {type:'fish',tone:1},{type:'fish',tone:2},{type:'fish',tone:0},{type:'fish',tone:3},
    {type:'fish',tone:2},{type:'fish',tone:1},{type:'turtle',tone:0},{type:'turtle',tone:1},
    {type:'crab',tone:0},{type:'crab',tone:1},{type:'crab',tone:2}
  ];
  const creatures=[];
  let width=1,height=1,dpr=1,frame=0,lastTime=0,visible=true,tabVisible=!document.hidden,destroyed=false;

  const palette=()=>{
    const skin=document.documentElement.dataset.skin;
    if(skin==='light')return {
      fish:['#1179a6','#e27649','#087a6a','#7959a8'],shell:['#27795e','#4a8468'],crab:['#c4523e','#d56b42','#a54848'],ink:'#153849',bubble:'rgba(255,255,255,.55)'
    };
    if(skin==='dark')return {
      fish:['#4a9eff','#ff9671','#32d16d','#b18cff'],shell:['#4aa67d','#6caf89'],crab:['#ff7567','#ef8a5b','#d65b6d'],ink:'#e5f6ff',bubble:'rgba(189,229,246,.28)'
    };
    return {
      fish:['#4a9eff','#ff9b72','#3ddc84','#b38cff'],shell:['#42a87b','#72bd91'],crab:['#ff7567','#f29560','#d75d73'],ink:'#e5f6ff',bubble:'rgba(189,229,246,.3)'
    };
  };

  const random=(min,max)=>min+Math.random()*(max-min);
  const createCreatures=()=>{
    creatures.length=0;
    animalPlan.forEach((plan,index)=>{
      const isCrab=plan.type==='crab';
      const direction=index%3===0?-1:1;
      creatures.push({
        ...plan,
        x:random(30,Math.max(31,width-30)),
        y:isCrab?height-random(25,48):random(70,Math.max(71,height-36)),
        vx:direction*random(10,20),
        vy:random(-2,2),
        direction,
        speed:random(11,22),
        size:plan.type==='fish'?random(10,15):plan.type==='turtle'?random(13,17):random(10,14),
        phase:random(0,Math.PI*2),
        depth:random(.76,1.16)
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
      creature.x=Math.min(width-12,Math.max(12,creature.x*(width/oldWidth)));
      creature.y=Math.min(height-14,Math.max(58,creature.y*(height/oldHeight)));
      if(creature.type==='crab')creature.y=height-random(25,44);
    });
    draw(performance.now(),0);
  };

  const roundedEllipse=(ctx,x,y,rx,ry,color)=>{
    ctx.beginPath();ctx.ellipse(x,y,rx,ry,0,0,Math.PI*2);ctx.fillStyle=color;ctx.fill();
  };

  const drawFish=(ctx,creature,colors,time)=>{
    const flip=creature.vx<0?-1:1,size=creature.size;
    ctx.save();ctx.translate(creature.x,creature.y);ctx.scale(flip,1);
    const sway=Math.sin(time*.004+creature.phase)*.22;
    ctx.rotate(sway*.08);
    ctx.globalAlpha=.72+.2*creature.depth;
    roundedEllipse(ctx,0,0,size*1.35,size*.66,colors.fish[creature.tone%colors.fish.length]);
    ctx.beginPath();ctx.moveTo(-size*1.15,0);ctx.lineTo(-size*2,-size*.78*(1+sway));ctx.lineTo(-size*1.9,size*.78*(1-sway));ctx.closePath();ctx.fill();
    ctx.beginPath();ctx.moveTo(-size*.1,-size*.15);ctx.quadraticCurveTo(size*.2,-size*1.1,size*.58,-size*.48);ctx.fillStyle='rgba(255,255,255,.25)';ctx.fill();
    roundedEllipse(ctx,size*.72,-size*.13,size*.12,size*.12,colors.ink);
    ctx.restore();
  };

  const drawTurtle=(ctx,creature,colors,time)=>{
    const flip=creature.vx<0?-1:1,size=creature.size,flap=Math.sin(time*.003+creature.phase)*.28;
    ctx.save();ctx.translate(creature.x,creature.y);ctx.scale(flip,1);ctx.rotate(creature.vy*.01);
    ctx.globalAlpha=.82;
    ctx.fillStyle=colors.shell[creature.tone%colors.shell.length];
    for(const side of [-1,1]){
      ctx.save();ctx.rotate(side*flap);roundedEllipse(ctx,-size*.15,side*size*.72,size*.72,size*.25,ctx.fillStyle);ctx.restore();
    }
    roundedEllipse(ctx,0,0,size,size*.7,ctx.fillStyle);
    ctx.strokeStyle='rgba(230,255,240,.45)';ctx.lineWidth=1;ctx.beginPath();ctx.ellipse(0,0,size*.67,size*.48,0,0,Math.PI*2);ctx.stroke();
    roundedEllipse(ctx,size*1.1,0,size*.32,size*.28,ctx.fillStyle);
    roundedEllipse(ctx,size*1.23,-size*.07,size*.045,size*.045,colors.ink);
    ctx.restore();
  };

  const drawCrab=(ctx,creature,colors,time)=>{
    const size=creature.size,wave=Math.sin(time*.004+creature.phase)*.18,color=colors.crab[creature.tone%colors.crab.length];
    ctx.save();ctx.translate(creature.x,creature.y);ctx.globalAlpha=.9;ctx.strokeStyle=color;ctx.fillStyle=color;ctx.lineWidth=2;ctx.lineCap='round';
    for(const side of [-1,1])for(let leg=0;leg<3;leg++){
      ctx.beginPath();ctx.moveTo(side*size*.55,(leg-1)*size*.22);ctx.lineTo(side*size*(1.15+leg*.12),size*(.35+leg*.18));ctx.stroke();
    }
    roundedEllipse(ctx,0,0,size*.78,size*.52,color);
    for(const side of [-1,1]){
      ctx.beginPath();ctx.moveTo(side*size*.5,-size*.25);ctx.lineTo(side*size*(1.18+wave),-size*.82);ctx.stroke();
      ctx.beginPath();ctx.arc(side*size*(1.35+wave),-size*.92,size*.28,0,Math.PI*2);ctx.fill();
      roundedEllipse(ctx,side*size*.28,-size*.48,size*.08,size*.08,colors.ink);
    }
    ctx.restore();
  };

  const drawBubbles=(ctx,time,colors)=>{
    ctx.strokeStyle=colors.bubble;ctx.lineWidth=1;
    for(let index=0;index<12;index++){
      const x=(index*83+31)%Math.max(width,1);
      const y=(height-((time*.014+index*47)%(height+40)))+20;
      const radius=1.5+(index%3);
      ctx.beginPath();ctx.arc(x,y,radius,0,Math.PI*2);ctx.stroke();
    }
  };

  const updateCreature=(creature,elapsed,time)=>{
    const isCrab=creature.type==='crab';
    const dx=pointer.x-creature.x,dy=pointer.y-creature.y,distance=Math.hypot(dx,dy);
    if(pointer.active&&distance<175&&distance>8){
      const pull=(1-distance/175)*(isCrab?18:34);
      creature.vx+=(dx/distance)*pull*elapsed;
      creature.vy+=(dy/distance)*pull*elapsed;
    }else{
      const cruise=creature.direction*creature.speed;
      creature.vx+=(cruise-creature.vx)*elapsed*.55;
      creature.vy+=Math.sin(time*.0014+creature.phase)*elapsed*2.2;
    }
    const maxSpeed=pointer.active?42:26;
    const speed=Math.hypot(creature.vx,creature.vy);
    if(speed>maxSpeed){creature.vx=creature.vx/speed*maxSpeed;creature.vy=creature.vy/speed*maxSpeed;}
    creature.x+=creature.vx*elapsed;creature.y+=creature.vy*elapsed;
    if(creature.x>width+35)creature.x=-35;
    if(creature.x<-35)creature.x=width+35;
    if(isCrab){creature.y+=(height-34-creature.y)*elapsed*1.8;creature.y=Math.min(height-18,Math.max(height-58,creature.y));}
    else{
      if(creature.y<62){creature.y=62;creature.vy=Math.abs(creature.vy);}
      if(creature.y>height-25){creature.y=height-25;creature.vy=-Math.abs(creature.vy);}
    }
  };

  function draw(time,elapsed){
    context.clearRect(0,0,width,height);
    const colors=palette();
    drawBubbles(context,time,colors);
    creatures.forEach(creature=>{
      if(elapsed)updateCreature(creature,elapsed,time);
      if(creature.type==='turtle')drawTurtle(context,creature,colors,time);
      else if(creature.type==='crab')drawCrab(context,creature,colors,time);
      else drawFish(context,creature,colors,time);
    });
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
    pointer.x=event.clientX-rect.left;pointer.y=event.clientY-rect.top;pointer.kind=event.pointerType||'mouse';pointer.active=active;
  };
  canvas.addEventListener('pointerenter',event=>{if(event.pointerType!=='touch')setPointer(event);});
  canvas.addEventListener('pointermove',event=>{if(event.pointerType!=='touch'||event.buttons)setPointer(event);});
  canvas.addEventListener('pointerleave',()=>{pointer.active=false;});
  canvas.addEventListener('pointerdown',event=>setPointer(event));
  canvas.addEventListener('pointerup',()=>{pointer.active=false;});
  canvas.addEventListener('pointercancel',()=>{pointer.active=false;});

  const observer=new IntersectionObserver(entries=>{visible=entries[0]?.isIntersecting!==false;syncAnimation();},{rootMargin:'80px'});
  observer.observe(canvas);
  document.addEventListener('visibilitychange',()=>{tabVisible=!document.hidden;syncAnimation();});
  window.addEventListener('site-language-change',()=>draw(performance.now(),0));
  document.addEventListener('siteskinchange',()=>draw(performance.now(),0));
  const motionChanged=()=>syncAnimation();
  if(motionQuery.addEventListener)motionQuery.addEventListener('change',motionChanged);else motionQuery.addListener(motionChanged);
  const resizeObserver=new ResizeObserver(resize);resizeObserver.observe(canvas);resize();syncAnimation();

  window.__aboutOcean={
    get creatureCount(){return creatures.length;},
    get reducedMotion(){return motionQuery.matches;},
    get pointerActive(){return pointer.active;},
    get running(){return Boolean(frame);},
    destroy(){destroyed=true;syncAnimation();observer.disconnect();resizeObserver.disconnect();}
  };
})();
