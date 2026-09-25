/* Smooth, image-led ocean animation. Loaded lazily by about-ocean-loader.js. */
(() => {
  'use strict';
  const canvas=document.getElementById('oceanCanvas');
  if(!canvas)return;
  const context=canvas.getContext('2d');
  if(!context)return;

  const assets=window.__aboutOceanAssets||{};
  const motionQuery=matchMedia('(prefers-reduced-motion: reduce)');
  const pointer={x:0,y:0,active:false};
  const creatures=[];
  const bubbles=[];
  const ripples=[];
  const grassAnchors=[.015,.04,.075,.11,.15,.19,.8,.835,.87,.91,.95,.985];
  const plan=[
    ['turtle',.88,1,.28],['turtle',.66,-1,.72],['crab',.92,-1,.24],['crab',.78,1,.77],
    ['fish',.35,1,.12],['fish',.42,1,.38],['fish',.48,1,.63],['fish',.58,-1,.88],
    ['fish',.64,-1,.19],['fish',.72,-1,.47],['fish',.52,1,.69],['fish',.3,-1,.84]
  ];
  let width=1,height=1,dpr=1,frame=0,lastTime=0,visible=true,tabVisible=!document.hidden,destroyed=false;
  const TAU=Math.PI*2;
  const random=(min,max)=>min+Math.random()*(max-min);
  const easeInOut=value=>.5-.5*Math.cos(Math.PI*value);

  function seedScene(){
    creatures.length=0;bubbles.length=0;
    plan.forEach(([type,depth,direction,xRatio],index)=>{
      const speed=type==='fish'?random(18,27):type==='turtle'?random(10,15):random(7,11);
      const baseY=type==='crab'?height-random(24,38):random(height*.24,height*.7);
      creatures.push({
        type,depth,direction,index,
        x:width*xRatio+random(-24,24),
        baseY,y:baseY,speed,phase:index*.71+random(0,.7),
        size:type==='fish'?random(.56,.72):type==='turtle'?random(.68,.82):random(.46,.58),
        vx:direction*speed,vy:0
      });
    });
    for(let index=0;index<30;index++)bubbles.push({x:random(0,width),y:random(0,height),radius:random(.8,3.3),speed:random(5,15),phase:random(0,TAU)});
  }

  function resize(){
    const rect=canvas.getBoundingClientRect(),oldWidth=width,oldHeight=height;
    width=Math.max(1,Math.round(rect.width));height=Math.max(1,Math.round(rect.height));dpr=Math.min(devicePixelRatio||1,2);
    canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);context.setTransform(dpr,0,0,dpr,0,0);
    if(!creatures.length)seedScene();
    else creatures.forEach(creature=>{
      creature.x=creature.x*(width/oldWidth);creature.baseY=creature.baseY*(height/oldHeight);
      if(creature.type==='crab')creature.baseY=height-random(24,38);
    });
    draw(performance.now(),0);
  }

  function drawCaustics(ctx,time){
    ctx.save();ctx.globalCompositeOperation='screen';ctx.globalAlpha=.13;
    for(let index=0;index<5;index++){
      const x=width*(.08+index*.22)+Math.sin(time*.00022+index*1.3)*42;
      const gradient=ctx.createLinearGradient(x,0,x+85,height);
      gradient.addColorStop(0,'rgba(255,255,238,.95)');gradient.addColorStop(1,'rgba(116,238,244,0)');
      ctx.fillStyle=gradient;ctx.beginPath();ctx.moveTo(x-16,0);ctx.lineTo(x+20,0);ctx.lineTo(x+125,height);ctx.lineTo(x+52,height);ctx.closePath();ctx.fill();
    }
    ctx.restore();
  }

  function drawBubbles(ctx,time){
    ctx.save();ctx.strokeStyle='rgba(246,255,255,.72)';ctx.lineWidth=1;
    bubbles.forEach((bubble,index)=>{
      const y=(bubble.y-time*.001*bubble.speed+height*4)%height;
      const x=bubble.x+Math.sin(time*.0011+bubble.phase)*8;
      ctx.globalAlpha=.28+(index%5)*.08;ctx.beginPath();ctx.arc(x,y,bubble.radius,0,TAU);ctx.stroke();
      if(bubble.radius>2.3){ctx.fillStyle='rgba(255,255,255,.72)';ctx.beginPath();ctx.arc(x-bubble.radius*.28,y-bubble.radius*.35,.55,0,TAU);ctx.fill();}
    });ctx.restore();
  }

  function drawGrass(ctx,time){
    ctx.save();ctx.lineCap='round';
    grassAnchors.forEach((ratio,index)=>{
      const base=width*ratio,stalks=2+(index%3);
      for(let stalk=0;stalk<stalks;stalk++){
        const tall=58+(index*21+stalk*17)%80;
        const sway=Math.sin(time*.00085+index*.62+stalk*.8)*12;
        const gradient=ctx.createLinearGradient(base,height,base,height-tall);
        gradient.addColorStop(0,'rgba(18,122,90,.72)');gradient.addColorStop(1,'rgba(119,196,94,.82)');
        ctx.strokeStyle=gradient;ctx.lineWidth=4.6-stalk*.65;
        ctx.beginPath();ctx.moveTo(base+stalk*6,height+5);ctx.bezierCurveTo(base-6,height-tall*.42,base+sway*.55,height-tall*.7,base+sway+stalk*4,height-tall);ctx.stroke();
      }
    });ctx.restore();
  }

  function imageSize(type){
    if(type==='turtle')return {w:150,h:100};
    if(type==='crab')return {w:108,h:72};
    return {w:92,h:61};
  }

  function drawTurtlePart(ctx,image,polygon,pivot,angle){
    ctx.save();ctx.translate(pivot[0],pivot[1]);ctx.rotate(angle);ctx.translate(-pivot[0],-pivot[1]);
    ctx.beginPath();polygon.forEach(([x,y],index)=>index?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.closePath();ctx.clip();ctx.drawImage(image,0,0);ctx.restore();
  }

  function drawTurtle(ctx,image,phase,size){
    const frontStroke=Math.sin(phase*.58),rearStroke=Math.sin(phase*.58+Math.PI*.72);
    const sourceWidth=image.naturalWidth,sourceHeight=image.naturalHeight;
    ctx.save();ctx.translate(-size.w/2,-size.h/2);ctx.scale(size.w/sourceWidth,size.h/sourceHeight);
    drawTurtlePart(ctx,image,[[350,135],[550,135],[550,330],[400,300],[365,215]],[407,181],frontStroke*-.075);
    drawTurtlePart(ctx,image,[[72,170],[190,168],[195,225],[132,276],[70,255]],[157,190],rearStroke*.055);
    ctx.save();ctx.beginPath();[[34,25],[470,18],[550,70],[550,214],[410,230],[330,222],[255,220],[185,214],[102,207],[38,188]].forEach(([x,y],index)=>index?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.closePath();ctx.clip();ctx.drawImage(image,0,0);ctx.restore();
    drawTurtlePart(ctx,image,[[0,151],[151,137],[177,188],[123,247],[0,247]],[139,177],rearStroke*-.07);
    drawTurtlePart(ctx,image,[[151,145],[371,135],[430,215],[307,349],[163,349]],[323,176],frontStroke*.105);
    ctx.restore();
  }

  function drawCreature(ctx,creature,time){
    const image=assets[creature.type];if(!(image?.complete&&image.naturalWidth))return;
    const phase=time*.001*creature.speed*.3+creature.phase;
    const wave=Math.sin(phase),slow=Math.sin(phase*.48+creature.phase);
    const size=imageSize(creature.type);
    const scale=creature.size*(.82+creature.depth*.26);
    const facing=creature.vx<0?-1:1;
    let breatheX=1,breatheY=1,rotation=0,shear=0;
    if(creature.type==='fish'){
      breatheX=1+wave*.035;breatheY=1-wave*.026;rotation=wave*.055+creature.vy*.008;shear=wave*.025;
    }else if(creature.type==='turtle'){
      breatheX=1+slow*.006;breatheY=1-slow*.004;rotation=wave*.025+creature.vy*.006;
    }else{
      breatheX=1-wave*.025;breatheY=1+Math.abs(wave)*.035;rotation=wave*.045;
    }
    const fade=Math.min(1,Math.max(0,(creature.x+80)/80),Math.max(0,(width+80-creature.x)/80));
    ctx.save();ctx.translate(creature.x,creature.y);ctx.rotate(rotation);ctx.transform(facing*breatheX,shear,0,breatheY,0,0);ctx.scale(scale,scale);
    ctx.globalAlpha=(.58+creature.depth*.4)*fade;
    ctx.shadowColor='rgba(31,125,133,.2)';ctx.shadowBlur=10;ctx.shadowOffsetY=5;
    if(creature.type==='turtle')drawTurtle(ctx,image,phase,size);else ctx.drawImage(image,-size.w/2,-size.h/2,size.w,size.h);
    ctx.restore();
  }

  function updateCreature(creature,elapsed,time){
    const dx=pointer.x-creature.x,dy=pointer.y-creature.y,distance=Math.hypot(dx,dy);
    const baseVelocity=creature.direction*creature.speed;
    if(pointer.active&&distance<210&&distance>10){
      const pull=(1-distance/210)*(creature.type==='crab'?7:18);
      creature.vx+=(dx/distance)*pull*elapsed;creature.vy+=(dy/distance)*pull*elapsed;
    }else{
      creature.vx+=(baseVelocity-creature.vx)*elapsed*.75;creature.vy*=Math.pow(.2,elapsed);
    }
    const maxSpeed=creature.speed*1.8,speed=Math.hypot(creature.vx,creature.vy);
    if(speed>maxSpeed){creature.vx=creature.vx/speed*maxSpeed;creature.vy=creature.vy/speed*maxSpeed;}
    creature.x+=creature.vx*elapsed;
    const travel=((creature.x/(width+160))+creature.phase)%1;
    const arc=Math.sin(travel*TAU+creature.phase)*12;
    const glide=Math.sin(time*.00065+creature.phase)*7;
    const desiredY=creature.type==='crab'?creature.baseY+Math.abs(Math.sin(time*.0026+creature.phase))*3:creature.type==='turtle'?creature.baseY+arc*.48+glide*.38:creature.baseY+arc+glide;
    creature.y+=(desiredY-creature.y)*Math.min(1,elapsed*2.3);creature.y+=creature.vy*elapsed;
    if(creature.x>width+100){creature.x=-100;creature.baseY=creature.type==='crab'?height-random(24,38):random(height*.25,height*.7);}
    if(creature.x<-100){creature.x=width+100;creature.baseY=creature.type==='crab'?height-random(24,38):random(height*.25,height*.7);}
  }

  function drawRipples(ctx,time){
    for(let index=ripples.length-1;index>=0;index--){
      const ripple=ripples[index],age=(time-ripple.born)/1000;
      if(age>1.9){ripples.splice(index,1);continue;}
      const progress=Math.max(0,Math.min(1,age/1.9)),eased=easeInOut(Math.min(1,progress*1.08));
      ctx.save();ctx.strokeStyle='rgba(255,255,255,.88)';ctx.globalAlpha=Math.pow(1-progress,1.35)*.72;
      for(let ring=0;ring<3;ring++){
        const ringProgress=Math.max(0,eased-ring*.065);if(!ringProgress)continue;
        ctx.lineWidth=1.8-ring*.32;ctx.beginPath();ctx.arc(ripple.x,ripple.y,ringProgress*ripple.maxRadius,0,TAU);ctx.stroke();
      }ctx.restore();
    }
  }

  function draw(time,elapsed){
    context.clearRect(0,0,width,height);drawCaustics(context,time);drawBubbles(context,time);
    creatures.slice().sort((a,b)=>a.depth-b.depth).forEach(creature=>{if(elapsed)updateCreature(creature,elapsed,time);drawCreature(context,creature,time);});
    drawGrass(context,time);drawRipples(context,time);
  }

  const shouldAnimate=()=>visible&&tabVisible&&!motionQuery.matches&&!destroyed;
  const animate=time=>{
    if(!shouldAnimate()){frame=0;lastTime=0;draw(time,0);return;}
    const elapsed=lastTime?Math.min((time-lastTime)/1000,.034):0;lastTime=time;draw(time,elapsed);frame=requestAnimationFrame(animate);
  };
  const syncAnimation=()=>{
    if(shouldAnimate()&&!frame)frame=requestAnimationFrame(animate);
    else if(!shouldAnimate()&&frame){cancelAnimationFrame(frame);frame=0;lastTime=0;draw(performance.now(),0);}
  };
  const setPointer=(event,active=true)=>{const rect=canvas.getBoundingClientRect();pointer.x=event.clientX-rect.left;pointer.y=event.clientY-rect.top;pointer.active=active;};
  canvas.addEventListener('pointerenter',event=>{if(event.pointerType!=='touch')setPointer(event);});
  canvas.addEventListener('pointermove',event=>{if(event.pointerType!=='touch'||event.buttons)setPointer(event);});
  canvas.addEventListener('pointerleave',()=>{pointer.active=false;});canvas.addEventListener('pointerdown',event=>setPointer(event));canvas.addEventListener('pointerup',()=>{pointer.active=false;});canvas.addEventListener('pointercancel',()=>{pointer.active=false;});
  canvas.addEventListener('click',event=>{
    const rect=canvas.getBoundingClientRect(),x=event.clientX-rect.left,y=event.clientY-rect.top;
    ripples.push({x,y,born:performance.now(),maxRadius:Math.hypot(Math.max(x,width-x),Math.max(y,height-y))});
    if(motionQuery.matches)draw(performance.now(),0);else syncAnimation();
  });
  const observer=new IntersectionObserver(entries=>{visible=entries[0]?.isIntersecting!==false;syncAnimation();},{rootMargin:'100px'});observer.observe(canvas);
  document.addEventListener('visibilitychange',()=>{tabVisible=!document.hidden;syncAnimation();});
  const motionChanged=()=>syncAnimation();if(motionQuery.addEventListener)motionQuery.addEventListener('change',motionChanged);else motionQuery.addListener(motionChanged);
  const resizeObserver=new ResizeObserver(resize);resizeObserver.observe(canvas);resize();syncAnimation();

  window.__aboutOcean={
    get creatureCount(){return creatures.length;},get rippleCount(){return ripples.length;},get seaweedClusterCount(){return grassAnchors.length;},
    get latestRippleRadius(){return ripples.at(-1)?.maxRadius||0;},get reducedMotion(){return motionQuery.matches;},get pointerActive(){return pointer.active;},get running(){return Boolean(frame);},
    get style(){return 'luminous-watercolor';},get lazyLoaded(){return true;},
    destroy(){destroyed=true;syncAnimation();observer.disconnect();resizeObserver.disconnect();}
  };
})();
