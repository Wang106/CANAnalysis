/* Original hand-drawn ocean animation for the About page. */
(() => {
  'use strict';

  const canvas=document.getElementById('oceanCanvas');
  if(!canvas)return;
  const context=canvas.getContext('2d');
  if(!context)return;

  const motionQuery=matchMedia('(prefers-reduced-motion: reduce)');
  const pointer={x:0,y:0,active:false};
  const ripples=[];
  const creatures=[];
  const bubbles=[];
  const foregroundWeeds=[.015,.035,.06,.09,.13,.17,.81,.845,.88,.92,.955,.985];
  const palettes=[
    {body:'#f1cf63',belly:'#fff0a4',fin:'#e57750',line:'#513d3c'},
    {body:'#7fc4c1',belly:'#cbe9d7',fin:'#e4a95b',line:'#324d51'},
    {body:'#d88c9a',belly:'#f3c8bf',fin:'#7a86bd',line:'#513b53'},
    {body:'#8cad62',belly:'#d7dc94',fin:'#d77949',line:'#394837'}
  ];
  let width=1,height=1,dpr=1,frame=0,lastTime=0,visible=true,tabVisible=!document.hidden,destroyed=false;

  const random=(min,max)=>min+Math.random()*(max-min);
  const TAU=Math.PI*2;

  function roundedStroke(ctx,color,widthValue){
    ctx.strokeStyle=color;ctx.lineWidth=widthValue;ctx.lineCap='round';ctx.lineJoin='round';
  }

  function seedScene(){
    creatures.length=0;bubbles.length=0;
    const plans=[
      ['turtle',.74,1],['turtle',.48,-1],['crab',.88,-1],['crab',.22,1],
      ['fish',.24,1],['fish',.3,1],['fish',.36,1],['fish',.64,-1],
      ['fish',.7,-1],['fish',.76,-1],['fish',.54,1],['fish',.42,-1]
    ];
    plans.forEach(([type,depth,direction],index)=>{
      const isCrab=type==='crab';
      creatures.push({
        type,depth,direction,
        x:random(40,Math.max(41,width-40)),
        y:isCrab?height-random(27,43):random(72,Math.max(73,height-72)),
        vx:direction*random(type==='fish'?20:11,type==='fish'?34:19),vy:random(-1.5,1.5),
        size:type==='fish'?random(.68,1.02):type==='turtle'?random(.76,1):random(.72,.95),
        phase:index*.83+random(0,.8),palette:palettes[index%palettes.length]
      });
    });
    for(let index=0;index<24;index++)bubbles.push({
      x:random(0,width),y:random(10,height),radius:random(1.2,3.8),speed:random(6,17),phase:random(0,TAU)
    });
  }

  const resize=()=>{
    const rect=canvas.getBoundingClientRect();
    const oldWidth=width,oldHeight=height;
    width=Math.max(1,Math.round(rect.width));height=Math.max(1,Math.round(rect.height));
    dpr=Math.min(devicePixelRatio||1,2);
    canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);
    context.setTransform(dpr,0,0,dpr,0,0);
    if(!creatures.length)seedScene();
    else creatures.forEach(creature=>{
      creature.x=Math.max(20,Math.min(width-20,creature.x*(width/oldWidth)));
      creature.y=Math.max(55,Math.min(height-40,creature.y*(height/oldHeight)));
      if(creature.type==='crab')creature.y=height-random(27,43);
    });
    draw(performance.now(),0);
  };

  function drawWaterLight(ctx,time){
    ctx.save();ctx.globalCompositeOperation='screen';ctx.globalAlpha=.1;
    for(let index=0;index<4;index++){
      const x=width*(.18+index*.23)+Math.sin(time*.0003+index)*35;
      const gradient=ctx.createLinearGradient(x,0,x+70,height);
      gradient.addColorStop(0,'rgba(214,250,255,.9)');gradient.addColorStop(1,'rgba(91,187,213,0)');
      ctx.fillStyle=gradient;ctx.beginPath();ctx.moveTo(x-18,0);ctx.lineTo(x+25,0);ctx.lineTo(x+115,height);ctx.lineTo(x+50,height);ctx.closePath();ctx.fill();
    }
    ctx.restore();
  }

  function drawBubbles(ctx,time){
    ctx.save();roundedStroke(ctx,'rgba(225,250,255,.62)',1.15);
    bubbles.forEach((bubble,index)=>{
      const drift=Math.sin(time*.0014+bubble.phase)*7;
      const y=(bubble.y-time*.001*bubble.speed+height*3)%height;
      ctx.globalAlpha=.28+(index%4)*.1;
      ctx.beginPath();ctx.arc(bubble.x+drift,y,bubble.radius,0,TAU);ctx.stroke();
      if(bubble.radius>2.6){ctx.beginPath();ctx.arc(bubble.x+drift-bubble.radius*.3,y-bubble.radius*.35,.55,0,TAU);ctx.fillStyle='#fff';ctx.fill();}
    });
    ctx.restore();
  }

  function drawFish(ctx,creature,time){
    const swim=time*.0065+creature.phase;
    const tailWave=Math.sin(swim)*.5;
    const finWave=Math.sin(swim*1.15+.8)*.35;
    const palette=creature.palette;
    ctx.save();
    const squash=1+Math.sin(swim*.5)*.028;
    ctx.scale(squash,1/squash);
    roundedStroke(ctx,palette.line,2.1);
    ctx.save();ctx.translate(-28,1);ctx.rotate(tailWave);
    ctx.fillStyle=palette.fin;ctx.beginPath();ctx.moveTo(2,0);ctx.quadraticCurveTo(-15,-16,-24,-13);ctx.quadraticCurveTo(-18,0,-24,13);ctx.quadraticCurveTo(-12,16,2,2);ctx.closePath();ctx.fill();ctx.stroke();ctx.restore();
    ctx.fillStyle=palette.body;ctx.beginPath();ctx.moveTo(-26,0);ctx.bezierCurveTo(-14,-18,14,-20,31,-4);ctx.quadraticCurveTo(38,2,29,8);ctx.bezierCurveTo(11,20,-15,17,-26,0);ctx.closePath();ctx.fill();ctx.stroke();
    ctx.fillStyle=palette.belly;ctx.globalAlpha=.65;ctx.beginPath();ctx.ellipse(8,6,19,8,-.08,0,TAU);ctx.fill();ctx.globalAlpha=1;
    ctx.save();ctx.translate(0,7);ctx.rotate(.3+finWave);ctx.fillStyle=palette.fin;ctx.beginPath();ctx.moveTo(0,0);ctx.quadraticCurveTo(-2,13,-14,18);ctx.quadraticCurveTo(4,18,10,5);ctx.closePath();ctx.fill();ctx.stroke();ctx.restore();
    ctx.fillStyle='#fff8dc';ctx.beginPath();ctx.arc(21,-5,4.4,0,TAU);ctx.fill();ctx.stroke();
    ctx.fillStyle='#20242d';ctx.beginPath();ctx.arc(22.2,-4.8,1.7,0,TAU);ctx.fill();
    ctx.beginPath();ctx.arc(31,3,4.5,-.7,.7);ctx.stroke();
    ctx.restore();
  }

  function drawTurtle(ctx,creature,time){
    const swim=time*.0042+creature.phase;
    const palette={line:'#344837',skin:'#789d69',skinLight:'#b7c88a',shell:'#9b653e',shellLight:'#d29a5a'};
    const front=Math.sin(swim)*.62,rear=Math.sin(swim+Math.PI)*.34;
    const drawFlipper=(x,y,angle,length,phase)=>{
      ctx.save();ctx.translate(x,y);ctx.rotate(angle+phase);ctx.fillStyle=palette.skin;
      ctx.beginPath();ctx.moveTo(0,-4);ctx.bezierCurveTo(length*.25,-10,length*.82,-8,length,0);ctx.bezierCurveTo(length*.72,7,length*.18,8,0,4);ctx.closePath();ctx.fill();ctx.stroke();ctx.restore();
    };
    roundedStroke(ctx,palette.line,2.3);
    drawFlipper(-15,-11,-2.2,31,-front*.55);drawFlipper(8,-12,-.65,34,front);
    drawFlipper(-17,9,2.42,23,rear);drawFlipper(9,11,.7,24,-rear);
    ctx.fillStyle=palette.shell;ctx.beginPath();ctx.ellipse(-3,0,29,20,-.05,0,TAU);ctx.fill();ctx.stroke();
    ctx.fillStyle=palette.shellLight;ctx.beginPath();ctx.ellipse(-4,-2,22,14,-.05,0,TAU);ctx.fill();
    roundedStroke(ctx,'rgba(76,54,43,.72)',1.3);
    for(let ring=0;ring<6;ring++){const a=ring/6*TAU;ctx.beginPath();ctx.moveTo(-4,-2);ctx.lineTo(-4+Math.cos(a)*21,-2+Math.sin(a)*13);ctx.stroke();}
    ctx.beginPath();ctx.ellipse(-4,-2,10,7,0,0,TAU);ctx.stroke();
    roundedStroke(ctx,palette.line,2.3);
    ctx.fillStyle=palette.skin;ctx.beginPath();ctx.ellipse(28,-2,14,10,.05,0,TAU);ctx.fill();ctx.stroke();
    ctx.fillStyle=palette.skinLight;ctx.beginPath();ctx.ellipse(31,2,8,4,.08,0,TAU);ctx.fill();
    ctx.fillStyle='#fff';ctx.beginPath();ctx.arc(33,-6,3.4,0,TAU);ctx.fill();ctx.stroke();ctx.fillStyle='#17221b';ctx.beginPath();ctx.arc(34,-5.6,1.4,0,TAU);ctx.fill();
    ctx.beginPath();ctx.arc(39,1,5,-.25,.8);ctx.stroke();
  }

  function drawCrab(ctx,creature,time){
    const walk=time*.008+creature.phase;
    const line='#63352d',body='#d76c4a',light='#f29a67';
    roundedStroke(ctx,line,2.2);
    for(const side of [-1,1]){
      for(let leg=0;leg<4;leg++){
        const phase=Math.sin(walk+leg*1.15+(side<0?Math.PI:0));
        const hipX=side*(13+leg*2),hipY=5+leg*2;
        const kneeX=side*(25+leg*3),kneeY=10+phase*4;
        const footX=side*(35+leg*4),footY=18-phase*3;
        ctx.beginPath();ctx.moveTo(hipX,hipY);ctx.lineTo(kneeX,kneeY);ctx.lineTo(footX,footY);ctx.stroke();
      }
      const claw=Math.sin(walk*.58+(side<0?1.6:0))*.2;
      ctx.save();ctx.translate(side*13,-5);ctx.rotate(side*(.78+claw));ctx.beginPath();ctx.moveTo(0,0);ctx.lineTo(side*18,-14);ctx.stroke();
      ctx.fillStyle=body;ctx.beginPath();ctx.ellipse(side*23,-17,9,7,side*.35,0,TAU);ctx.fill();ctx.stroke();
      ctx.beginPath();ctx.moveTo(side*22,-18);ctx.quadraticCurveTo(side*31,-27,side*30,-16);ctx.stroke();ctx.restore();
    }
    ctx.fillStyle=body;ctx.beginPath();ctx.moveTo(-25,7);ctx.quadraticCurveTo(-23,-17,0,-20);ctx.quadraticCurveTo(23,-17,25,7);ctx.quadraticCurveTo(15,18,0,16);ctx.quadraticCurveTo(-15,18,-25,7);ctx.closePath();ctx.fill();ctx.stroke();
    ctx.fillStyle=light;ctx.beginPath();ctx.ellipse(0,-4,17,9,0,0,Math.PI);ctx.fill();
    for(const x of [-9,9]){ctx.beginPath();ctx.moveTo(x,-15);ctx.lineTo(x,-24);ctx.stroke();ctx.fillStyle='#fff';ctx.beginPath();ctx.arc(x,-26,4,0,TAU);ctx.fill();ctx.stroke();ctx.fillStyle='#231e1d';ctx.beginPath();ctx.arc(x+(x<0?-1:1),-26,1.5,0,TAU);ctx.fill();}
    ctx.beginPath();ctx.arc(0,2,8,.15,Math.PI-.15);ctx.stroke();
  }

  function drawCreature(ctx,creature,time){
    const flip=creature.vx<0?-1:1;
    const base=creature.type==='fish'?1:creature.type==='turtle'?1.28:1.05;
    const scale=base*creature.size*(.72+creature.depth*.34);
    const bob=Math.sin(time*.0018+creature.phase)*4;
    ctx.save();ctx.translate(creature.x,creature.y+bob);ctx.scale(flip*scale,scale);
    ctx.rotate(Math.sin(time*.0014+creature.phase)*.035+creature.vy*.006);
    ctx.globalAlpha=.65+creature.depth*.33;ctx.shadowColor='rgba(12,42,50,.23)';ctx.shadowBlur=5;ctx.shadowOffsetY=3;
    if(creature.type==='fish')drawFish(ctx,creature,time);else if(creature.type==='turtle')drawTurtle(ctx,creature,time);else drawCrab(ctx,creature,time);
    ctx.restore();
  }

  function drawForegroundWeeds(ctx,time){
    ctx.save();ctx.lineCap='round';
    foregroundWeeds.forEach((ratio,index)=>{
      const stalks=2+(index%3),baseX=width*ratio;
      for(let stalk=0;stalk<stalks;stalk++){
        const heightValue=55+(index*17+stalk*23)%75;
        const sway=Math.sin(time*.0011+index*.73+stalk)*14;
        ctx.beginPath();ctx.moveTo(baseX+stalk*7,height+6);ctx.bezierCurveTo(baseX-8+stalk*7,height-heightValue*.45,baseX+sway,height-heightValue*.7,baseX+sway*.8+stalk*6,height-heightValue);
        ctx.strokeStyle=stalk%2?'rgba(57,108,74,.84)':'rgba(38,85,67,.88)';ctx.lineWidth=4.8-stalk*.7;ctx.stroke();
      }
    });
    ctx.restore();
  }

  function drawRipples(ctx,time){
    for(let index=ripples.length-1;index>=0;index--){
      const ripple=ripples[index],age=(time-ripple.born)/1000;
      if(age>1.8){ripples.splice(index,1);continue;}
      const progress=Math.max(0,Math.min(1,age/1.8)),eased=1-Math.pow(1-progress,3);
      ctx.save();ctx.strokeStyle='rgba(231,252,255,.82)';ctx.globalAlpha=(1-progress)*.75;
      for(let ring=0;ring<3;ring++){
        const ringProgress=Math.max(0,eased-ring*.075);if(!ringProgress)continue;
        ctx.lineWidth=2-ring*.35;ctx.beginPath();ctx.arc(ripple.x,ripple.y,ringProgress*ripple.maxRadius,0,TAU);ctx.stroke();
      }
      ctx.restore();
    }
  }

  function updateCreature(creature,elapsed,time){
    const isCrab=creature.type==='crab';
    const dx=pointer.x-creature.x,dy=pointer.y-creature.y,distance=Math.hypot(dx,dy);
    if(pointer.active&&distance<190&&distance>8){
      const curiosity=(1-distance/190)*(isCrab?12:28);
      creature.vx+=(dx/distance)*curiosity*elapsed;creature.vy+=(dy/distance)*curiosity*elapsed;
    }else{
      const cruise=creature.direction*(creature.type==='fish'?28:creature.type==='turtle'?16:12);
      creature.vx+=(cruise-creature.vx)*elapsed*.7;creature.vy+=Math.sin(time*.0012+creature.phase)*elapsed*1.6;
    }
    const maxSpeed=pointer.active?44:36,speed=Math.hypot(creature.vx,creature.vy);
    if(speed>maxSpeed){creature.vx=creature.vx/speed*maxSpeed;creature.vy=creature.vy/speed*maxSpeed;}
    creature.x+=creature.vx*elapsed;creature.y+=creature.vy*elapsed;
    if(creature.x>width+70)creature.x=-70;if(creature.x<-70)creature.x=width+70;
    if(isCrab){creature.y+=(height-30-creature.y)*elapsed*2;creature.y=Math.max(height-48,Math.min(height-21,creature.y));}
    else{if(creature.y<60){creature.y=60;creature.vy=Math.abs(creature.vy);}if(creature.y>height-55){creature.y=height-55;creature.vy=-Math.abs(creature.vy);}}
  }

  function draw(time,elapsed){
    context.clearRect(0,0,width,height);drawWaterLight(context,time);drawBubbles(context,time);
    creatures.slice().sort((a,b)=>a.depth-b.depth).forEach(creature=>{if(elapsed)updateCreature(creature,elapsed,time);drawCreature(context,creature,time);});
    drawForegroundWeeds(context,time);drawRipples(context,time);
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
  canvas.addEventListener('pointerleave',()=>{pointer.active=false;});
  canvas.addEventListener('pointerdown',event=>setPointer(event));canvas.addEventListener('pointerup',()=>{pointer.active=false;});canvas.addEventListener('pointercancel',()=>{pointer.active=false;});
  canvas.addEventListener('click',event=>{
    const rect=canvas.getBoundingClientRect(),x=event.clientX-rect.left,y=event.clientY-rect.top;
    ripples.push({x,y,born:performance.now(),maxRadius:Math.hypot(Math.max(x,width-x),Math.max(y,height-y))});
    if(motionQuery.matches)draw(performance.now(),0);else syncAnimation();
  });

  const observer=new IntersectionObserver(entries=>{visible=entries[0]?.isIntersecting!==false;syncAnimation();},{rootMargin:'80px'});observer.observe(canvas);
  document.addEventListener('visibilitychange',()=>{tabVisible=!document.hidden;syncAnimation();});
  const motionChanged=()=>syncAnimation();if(motionQuery.addEventListener)motionQuery.addEventListener('change',motionChanged);else motionQuery.addListener(motionChanged);
  const resizeObserver=new ResizeObserver(resize);resizeObserver.observe(canvas);resize();syncAnimation();

  window.__aboutOcean={
    get creatureCount(){return creatures.length;},get rippleCount(){return ripples.length;},get seaweedClusterCount(){return foregroundWeeds.length;},
    get latestRippleRadius(){return ripples.at(-1)?.maxRadius||0;},get reducedMotion(){return motionQuery.matches;},get pointerActive(){return pointer.active;},get running(){return Boolean(frame);},get style(){return 'hand-drawn-cartoon';},
    destroy(){destroyed=true;syncAnimation();observer.disconnect();resizeObserver.disconnect();}
  };
})();
