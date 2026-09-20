const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const {createServer}=require('node:http');
const {readFile}=require('node:fs/promises');
const path=require('node:path');
const assert=require('node:assert/strict');

const publicRoot=path.resolve(__dirname,'../public');
const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.jpeg':'image/jpeg','.jpg':'image/jpeg','.webp':'image/webp'};
const server=createServer(async(req,res)=>{
  const pathname=new URL(req.url,'http://localhost').pathname;
  const relative=pathname==='/'?'aboutus.html':pathname.replace(/^\//,'');
  const file=path.resolve(publicRoot,relative);
  if(!file.startsWith(publicRoot+path.sep)){res.writeHead(403).end();return;}
  try{
    res.setHeader('Content-Type',types[path.extname(file)]||'application/octet-stream');
    res.end(await readFile(file));
  }catch{res.writeHead(404).end();}
});

(async()=>{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||undefined,args:['--no-sandbox','--disable-dev-shm-usage','--disable-gpu']});
  try{
    const page=await browser.newPage({viewport:{width:1280,height:720}});
    const url='http://127.0.0.1:'+server.address().port+'/aboutus.html';
    await page.goto(url,{waitUntil:'load'});
    await page.waitForFunction(()=>window.__aboutOcean?.lazyLoaded===true);
    const layout=await page.evaluate(()=>{
      const bounds=selector=>{const rect=document.querySelector(selector).getBoundingClientRect();return {top:rect.top,bottom:rect.bottom};};
      return {contact:bounds('.contact-note'),button:bounds('#supportButton'),payment:bounds('.pay-grid')};
    });
    assert.ok(layout.button.top>=layout.contact.bottom,'support button must sit below the contact guidance');
    assert.ok(layout.button.bottom<layout.payment.top,'support button must remain above the payment area');

    await page.click('#supportButton');
    await page.waitForTimeout(700);
    assert.equal(new URL(page.url()).hash,'','support button must reveal payment without adding a URL hash');
    assert.ok(Math.abs(await page.$eval('#support',element=>element.getBoundingClientRect().top))<90,'support button must scroll the payment section into view');

    const canvas=page.locator('#oceanCanvas');
    const box=await canvas.boundingBox();
    await canvas.click({position:{x:box.width/2,y:box.height/2}});
    const state=await page.evaluate(()=>({
      ripples:window.__aboutOcean.rippleCount,
      radius:window.__aboutOcean.latestRippleRadius,
      seaweed:window.__aboutOcean.seaweedClusterCount,
      style:window.__aboutOcean.style
    }));
    assert.ok(state.ripples>0,'clicking the ocean must create a ripple');
    assert.ok(state.radius>=Math.hypot(box.width/2,box.height/2)-2,'ripple must reach every corner of the animation canvas');
    assert.ok(state.seaweed>=12,'ocean scene must contain at least twelve dense seaweed clusters');
    assert.equal(state.style,'luminous-watercolor','ocean scene must use the brighter watercolor direction');
    console.log('PASS: support placement, full-canvas ripples and denser animated ocean scene');
  }finally{
    await browser.close();
    server.close();
  }
})().catch(error=>{console.error(error);server.close();process.exitCode=1;});
