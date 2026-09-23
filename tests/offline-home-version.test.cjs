const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const {createServer}=require('node:http');
const {readFile}=require('node:fs/promises');
const path=require('node:path');
const assert=require('node:assert/strict');

const root=path.resolve(__dirname,'..');
const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png'};
const server=createServer(async(req,res)=>{
  let pathname=new URL(req.url,'http://localhost').pathname;
  if(pathname==='/') pathname='/public/index.html';
  else if(pathname==='/offline') pathname='/public/offline.html';
  else if(!pathname.startsWith('/public/')) pathname='/public'+pathname;
  const file=path.resolve(root,'.'+pathname);
  if(!file.startsWith(root+path.sep)){ res.writeHead(403).end(); return; }
  try{
    res.setHeader('Content-Type',types[path.extname(file)]||'application/octet-stream');
    res.end(await readFile(file));
  }catch(error){ res.writeHead(404).end(); }
});

(async()=>{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const base='http://127.0.0.1:'+server.address().port;
  const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||undefined,args:['--no-sandbox','--disable-dev-shm-usage','--disable-gpu']});
  try{
    const page=await browser.newPage({viewport:{width:1280,height:900}});
    const errors=[];
    page.on('pageerror',error=>errors.push(error.message));
    await page.goto(base+'/offline');
    assert.equal(await page.locator('#sigBar').getAttribute('class'),'collapsed');
    assert.equal((await page.locator('.header-left .can-brand').innerText()).replace(/\s+/g,' '),'CANAnalysis CAN DATA WORKSPACE');
    assert.equal(await page.locator('.header-left .can-brand img').getAttribute('width'),'34');
    assert.equal(await page.locator('#hcommit').count(),0);
    await page.evaluate(async()=>{
      const dbc='VERSION ""\nBU_: ECU\nBO_ 256 Msg: 8 ECU\n SG_ Speed : 0|16@1+ (1,0) [0|65535] "km/h" ECU\n';
      await window.__can.loadDbcText('sample.dbc',dbc,false);
    });
    assert.match(await page.locator('#sigBar').getAttribute('class'),/expanded/);
    assert.equal(await page.locator('#totalCount').textContent(),'1');
    assert.deepEqual(errors,[]);

    await page.goto(base+'/');
    await page.waitForFunction(()=>document.getElementById('hcommit')?.textContent.length===8);
    assert.equal(await page.locator('footer #hcommit').count(),1);
    assert.match(await page.locator('footer #hcommit').textContent(),/^[0-9a-f]{8}$/i);
    assert.match(await page.locator('footer #hmodtime').textContent(),/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}发布$/);
    assert.deepEqual(errors,[]);
    console.log('PASS: homepage footer version and offline signal-panel behavior');
  }finally{
    await browser.close();
    server.close();
  }
})().catch(error=>{ console.error(error); server.close(); process.exitCode=1; });
