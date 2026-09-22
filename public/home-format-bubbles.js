(()=>{
  const visual=document.querySelector('.format-visual');
  if(!visual)return;
  const bubbles=[...visual.querySelectorAll('.format-nodes span')];
  const connector=visual.querySelector('.format-connector');
  if(bubbles.length<2||!connector)return;

  const reduced=matchMedia('(prefers-reduced-motion: reduce)');
  const starts=[[.03,.08],[.27,.58],[.22,.1],[.61,.57],[.48,.04],[.06,.6],[.75,.13],[.88,.6]];
  const velocities=[[.23,.16],[-.2,-.15],[.17,-.22],[-.24,.17],[.19,.14],[.21,-.18],[-.18,.2],[-.22,-.16]];
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
      return {element,size,x:old?Math.min(old.x,width-size):starts[index][0]*(width-size),y:old?Math.min(old.y,height-size):starts[index][1]*(height-size),vx:velocities[index][0],vy:velocities[index][1]};
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
    const a=bodies[0],b=bodies[6];
    if(!a||!b)return;
    const x1=a.x+a.size/2,y1=a.y+a.size/2,x2=b.x+b.size/2,y2=b.y+b.size/2;
    connector.style.left=`${x1}px`;connector.style.top=`${y1}px`;
    connector.style.width=`${Math.hypot(x2-x1,y2-y1)}px`;
    connector.style.transform=`rotate(${Math.atan2(y2-y1,x2-x1)}rad)`;
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
      }
      for(let i=0;i<bodies.length;i++)for(let j=i+1;j<bodies.length;j++)collide(bodies[i],bodies[j]);
      render();
    }
    frame=requestAnimationFrame(tick);
  }

  new ResizeObserver(layout).observe(visual);
  new IntersectionObserver(entries=>{visible=entries[0]?.isIntersecting??true;}).observe(visual);
  addEventListener('pagehide',()=>cancelAnimationFrame(frame),{once:true});
  layout();
  frame=requestAnimationFrame(tick);
})();
