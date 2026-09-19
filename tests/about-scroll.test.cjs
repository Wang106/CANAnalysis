const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const {createServer}=require('node:http');
const {readFile}=require('node:fs/promises');
const path=require('node:path');
const assert=require('node:assert/strict');

const publicRoot=path.resolve(__dirname,'../public');
const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.jpeg':'image/jpeg','.webp':'image/webp'};
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
    await page.goto(url+'#support');
    assert.equal(new URL(page.url()).hash,'','legacy support hash must be removed before it can force the reload position');

    await page.evaluate(()=>scrollTo(0,920));
    const before=await page.evaluate(()=>Math.round(scrollY));
    assert.ok(before>0,'test page must have enough content to scroll');
    await page.reload({waitUntil:'load'});
    await page.waitForTimeout(120);
    const after=await page.evaluate(()=>Math.round(scrollY));
    assert.ok(Math.abs(after-before)<=1,`reload must preserve the current scroll position (${before} -> ${after})`);
    assert.equal(new URL(page.url()).hash,'','reload must not recreate the support hash');
    console.log('PASS: about-page reload preserves the current scroll position');
  }finally{
    await browser.close();
    server.close();
  }
})().catch(error=>{console.error(error);server.close();process.exitCode=1;});
