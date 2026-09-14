// npm install --no-save playwright; npx playwright install chromium
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const {createServer}=require('node:http');
const {readFile}=require('node:fs/promises');
const path=require('node:path');
const assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
const types={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png'};
const server=createServer(async(req,res)=>{
  let url=new URL(req.url,'http://localhost').pathname;
  if(url==='/')url='/public/index.html';
  else if(['/convert','/aboutus'].includes(url))url='/public'+url+'.html';
  else if(!url.startsWith('/tests/')&&!url.startsWith('/public/'))url='/public'+url;
  const file=path.resolve(root,'.'+url);
  if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}
  try{res.setHeader('Content-Type',types[path.extname(file)]||'application/octet-stream');res.end(await readFile(file));}catch{res.writeHead(404).end();}
});
(async()=>{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const base='http://127.0.0.1:'+server.address().port;
  const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||undefined,args:['--no-sandbox','--disable-dev-shm-usage','--disable-gpu']});
  try{
    const page=await browser.newPage({viewport:{width:1280,height:900}});
    const errors=[];page.on('pageerror',error=>errors.push(error.message));
    await page.goto(base+'/convert');
    assert.equal(await page.inputValue('#targetFormat'),'asc');
    assert.equal(await page.locator('#targetFormat option').count(),7);
    assert.equal(await page.locator('#topNav a').first().getAttribute('href'),'/');
    assert.equal(await page.locator('#sourceFile').getAttribute('accept'),null);
    assert.equal(await page.locator('#startConvert').isDisabled(),true);
    const sample=Buffer.from('base hex timestamps absolute\n0.125 1 123 Rx d 2 01 FF\n1.25 2 18FF50E5x Tx d 1 02\n');
    for(const format of ['asc','log','trc','blf','txt','mf4','mdf']){
      await page.locator('#sourceFile').setInputFiles({name:'demo.asc',mimeType:'application/octet-stream',buffer:sample});
      await page.selectOption('#targetFormat',format);
      await page.click('#startConvert');
      await page.locator('#result').waitFor({state:'visible'});
      assert.equal(await page.locator('#preview tr').count(),2);
      const downloaded=page.waitForEvent('download');await page.click('#download');
      const download=await downloaded;assert.equal(download.suggestedFilename(),'demo_converted.'+format);assert.equal(await download.failure(),null);
    }
    await page.screenshot({path:process.env.SCREENSHOT_DIR?path.join(process.env.SCREENSHOT_DIR,'convert-desktop.png'):undefined,fullPage:true});
    for(const viewport of [{width:390,height:844},{width:844,height:390}]){
      await page.setViewportSize(viewport);
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'no page horizontal overflow');
      if(process.env.SCREENSHOT_DIR)await page.screenshot({path:path.join(process.env.SCREENSHOT_DIR,'convert-'+viewport.width+'.png'),fullPage:true});
    }
    await page.locator('#sourceFile').setInputFiles({name:'bad.asc',mimeType:'text/plain',buffer:Buffer.from('0.1 1 123 Rx d 8 01\n')});
    await page.click('#startConvert');await page.locator('#error').waitFor({state:'visible'});
    assert.equal(await page.locator('#result').isVisible(),false);
    // Cancel immediately while initial file identification is pending.
    await page.locator('#sourceFile').setInputFiles({name:'demo.asc',mimeType:'text/plain',buffer:sample});
    await page.evaluate(()=>{document.getElementById('startConvert').click();document.getElementById('cancel').click();});
    assert.match(await page.textContent('#status'),/已取消/);
    assert.equal(await page.locator('#startConvert').isEnabled(),true);
    assert.deepEqual(errors,[],'no conversion page script errors');
    await page.goto(base+'/tests/regression.html');
    await page.waitForFunction(()=>Array.isArray(window.__TEST_RESULTS__),{},{timeout:90000});
    const results=await page.evaluate(()=>window.__TEST_RESULTS__);
    console.log(JSON.stringify(results));
    assert.equal(results.every(t=>t.ok),true,'existing browser regressions');
    console.log('PASS: browser conversion/download all seven formats, desktop/mobile layout, cancel/errors and existing regressions');
  }finally{await browser.close();server.close();}
})().catch(error=>{console.error(error);server.close();process.exitCode=1;});
