(()=>{
  const visual=document.querySelector('.format-visual');
  if(!visual)return;
  const bubbles=[...visual.querySelectorAll('.format-nodes span')];
  if(!bubbles.length)return;

  const reduced=matchMedia('(prefers-reduced-motion: reduce)');
  const starts=[[.03,.08],[.27,.58],[.22,.1],[.61,.57],[.48,.04],[.06,.6],[.75,.13],[.88,.6]];
  const velocities=[[.453,.312],[-.44,-.332],[.337,-.434],[-.45,.318],[.444,.325],[.418,-.358],[-.369,.407],[-.447,-.32]];
  const idleSpeed=.5;
  let bodies=[];
  let frame=0;
  let previous=0;
  let visible=true;

  function layout(){
    const width=visual.clientWidth;
    const height=visual.clientHeight;
    bodies=bubbles.map((element,index)=>{
      const size=element.offsetWidth;
      const old=bodies[index];
      return {element,size,x:old?Math.min(old.x,width-size):starts[index][0]*(width-size),y:old?Math.min(old.y,height-size):starts[index][1]*(height-size),vx:old?.vx??velocities[index][0],vy:old?.vy??velocities[index][1]};
    });
    visual.classList.add('is-physics');
    render();
  }

  function collide(a,b){
    const ar=a.size/2;
    const br=b.size/2;
    const dx=b.x+br-a.x-ar;
    const dy=b.y+br-a.y-ar;
    const distance=Math.hypot(dx,dy)||.01;
    const minimum=ar+br+2;
    if(distance>=minimum)return;
    const nx=dx/distance;
    const ny=dy/distance;
    const overlap=(minimum-distance)/2;
    a.x-=nx*overlap;a.y-=ny*overlap;b.x+=nx*overlap;b.y+=ny*overlap;
    const relative=(b.vx-a.vx)*nx+(b.vy-a.vy)*ny;
    if(relative<0){a.vx+=relative*nx;a.vy+=relative*ny;b.vx-=relative*nx;b.vy-=relative*ny;}
  }

  function render(){
    for(const body of bodies)body.element.style.transform=`translate3d(${body.x.toFixed(2)}px,${body.y.toFixed(2)}px,0)`;
  }

  function kick(event){
    event.preventDefault();
    event.stopPropagation();
    const rect=visual.getBoundingClientRect();
    const clickX=event.clientX-rect.left;
    const clickY=event.clientY-rect.top;
    const radius=Math.min(150,Math.max(100,rect.width*.3));
    bodies.forEach((body,index)=>{
      let dx=body.x+body.size/2-clickX;
      let dy=body.y+body.size/2-clickY;
      let distance=Math.hypot(dx,dy);
      if(distance>=radius)return;
      if(distance<1){
        const angle=index*2.399+performance.now()/900;
        dx=Math.cos(angle);dy=Math.sin(angle);distance=1;
      }
      const force=2.05*Math.pow(1-distance/radius,2)+.18;
      body.vx+=dx/distance*force;
      body.vy+=dy/distance*force;
      const speed=Math.hypot(body.vx,body.vy);
      if(speed>2.4){body.vx=body.vx/speed*2.4;body.vy=body.vy/speed*2.4;}
      body.element.classList.remove('is-kicked');
      void body.element.offsetWidth;
      body.element.classList.add('is-kicked');
    });
  }

  function tick(now){
    if(!previous)previous=now;
    const step=Math.min(2,(now-previous)/16.67);
    previous=now;
    if(visible&&!reduced.matches){
      const width=visual.clientWidth,height=visual.clientHeight;
      for(const body of bodies){
        body.x+=body.vx*step;body.y+=body.vy*step;
        if(body.x<=0||body.x+body.size>=width){body.x=Math.max(0,Math.min(width-body.size,body.x));body.vx*=-1;}
        if(body.y<=0||body.y+body.size>=height){body.y=Math.max(0,Math.min(height-body.size,body.y));body.vy*=-1;}
        const drag=Math.pow(.996,step);
        body.vx*=drag;body.vy*=drag;
        const speed=Math.hypot(body.vx,body.vy);
        if(speed>0&&speed<idleSpeed){body.vx=body.vx/speed*idleSpeed;body.vy=body.vy/speed*idleSpeed;}
      }
      for(let i=0;i<bodies.length;i++)for(let j=i+1;j<bodies.length;j++)collide(bodies[i],bodies[j]);
      render();
    }
    frame=requestAnimationFrame(tick);
  }

  new ResizeObserver(layout).observe(visual);
  new IntersectionObserver(entries=>{visible=entries[0]?.isIntersecting??true;}).observe(visual);
  visual.addEventListener('click',kick);
  addEventListener('pagehide',()=>cancelAnimationFrame(frame),{once:true});
  layout();
  frame=requestAnimationFrame(tick);
})();
