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
    assert.equal(await page.evaluate(()=>getComputedStyle(document.querySelector('.conversion-grid')).gridTemplateColumns.split(' ').length),1,'source and target panels are not stacked');
    const sample=Buffer.from('base hex timestamps absolute\n0.125 1 123 Rx d 2 01 FF\n1.25 2 18FF50E5x Tx d 1 02\n');
    for(const format of ['asc','log','trc','blf','txt','mf4','mdf']){
      await page.locator('#sourceFile').setInputFiles({name:'demo.asc',mimeType:'application/octet-stream',buffer:sample});
      await page.selectOption('#targetFormat',format);
      await page.click('#startConvert');
      await page.locator('#result').waitFor({state:'visible'});
      assert.equal(await page.locator('#preview tr').count(),2);
      const downloaded=page.waitForEvent('download');await page.click('#download');
      const download=await downloaded;assert.equal(download.suggestedFilename(),'demo.'+format);assert.equal(await download.failure(),null);
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
    const savePage=await browser.newPage({viewport:{width:1000,height:800}});
    await savePage.addInitScript(()=>{
      const source=new File(['base hex timestamps absolute\n0.1 1 123 Rx d 1 FF\n'],'vehicle.log.asc',{type:'text/plain'});
      const sourceHandle={kind:'file',name:source.name,getFile:async()=>source};
      window.showOpenFilePicker=async()=>[sourceHandle];
      window.showSaveFilePicker=async options=>{window.__saveTest={options,sourceHandle};return {name:options.suggestedName,createWritable:async()=>({write:async blob=>window.__saveTest.bytes=blob.size,close:async()=>window.__saveTest.closed=true})};};
    });
    await savePage.goto(base+'/convert');await savePage.click('#chooseFile');await savePage.selectOption('#targetFormat','trc');await savePage.click('#startConvert');
    await savePage.locator('#result').waitFor({state:'visible'});
    const saveState=await savePage.evaluate(()=>({name:__saveTest.options.suggestedName,startIn:__saveTest.options.startIn===__saveTest.sourceHandle,bytes:__saveTest.bytes,closed:__saveTest.closed,status:document.getElementById('saveResult').textContent,downloadHidden:document.getElementById('download').hidden}));
    assert.equal(saveState.name,'vehicle.log.trc');assert.equal(saveState.startIn,true);assert.ok(saveState.bytes>0);assert.equal(saveState.closed,true);assert.match(saveState.status,/原文件所在位置/);assert.equal(saveState.downloadHidden,true);
    await savePage.evaluate(()=>window.showSaveFilePicker=async options=>({name:options.suggestedName,createWritable:async()=>{throw new DOMException('denied','NotAllowedError');}}));
    await savePage.selectOption('#targetFormat','blf');await savePage.click('#startConvert');await savePage.locator('#result').waitFor({state:'visible'});
    assert.match(await savePage.textContent('#saveResult'),/写入失败/);assert.equal(await savePage.locator('#download').isVisible(),true);assert.equal(await savePage.getAttribute('#download','download'),'vehicle.log.blf');
    await savePage.close();
    await page.goto(base+'/tests/regression.html');
    await page.waitForFunction(()=>Array.isArray(window.__TEST_RESULTS__),{},{timeout:90000});
    const results=await page.evaluate(()=>window.__TEST_RESULTS__);
    console.log(JSON.stringify(results));
    assert.equal(results.every(t=>t.ok),true,'existing browser regressions');
    console.log('PASS: seven-format downloads, source-path saves, write fallback, responsive layout and existing regressions');
  }finally{await browser.close();server.close();}
})().catch(error=>{console.error(error);server.close();process.exitCode=1;});
