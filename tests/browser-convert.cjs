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
    assert.equal(await page.locator('.format-card').count(),7);
    assert.equal(await page.locator('.format-card[aria-pressed="true"]').getAttribute('data-format'),'asc');
    assert.equal(await page.locator('#topNav a').first().getAttribute('href'),'/');
    assert.equal(await page.locator('#sourceFile').getAttribute('accept'),null);
    assert.equal(await page.locator('#sourceFile').getAttribute('multiple'),'');
    assert.equal(await page.locator('#sourceFormat').count(),0,'source format selector must be removed');
    assert.match(await page.textContent('#fileMeta'),/ASC、LOG、TRC、BLF、TXT、MF4、MDF 等七种日志格式/);
    assert.equal(await page.locator('.conversion-accordion').count(),3);
    assert.equal(await page.locator('#sourceAccordion').getAttribute('open'),'','source accordion must be expanded by default');
    assert.equal(await page.locator('#formatAccordion').getAttribute('open'),null);
    assert.equal(await page.locator('#csvAccordion').getAttribute('open'),null);
    assert.equal(await page.locator('.workflow-heading').count(),3,'all three workflow title rows must be visually emphasized');
    const headingColors=await page.locator('.workflow-heading').evaluateAll(nodes=>nodes.map(node=>getComputedStyle(node).getPropertyValue('--section-accent').trim()));
    assert.deepEqual(headingColors,['#38bdf8','#3ddc84','#a78bfa'],'workflow title colors must remain distinct for 01/02/03');
    assert.equal(await page.locator('.conversion-flow').evaluate(node=>getComputedStyle(node).rowGap),'8px','workflow sections must have visible spacing');
    const actionRight=await page.locator('#formatSummary .accordion-action, #csvSummary .accordion-action').evaluateAll(nodes=>nodes.map(node=>Math.round(node.getBoundingClientRect().right)));
    assert.equal(actionRight[0],actionRight[1],'format and CSV expand actions must align at the right');
    await page.click('#sourceSummary');assert.equal(await page.locator('#sourceAccordion').getAttribute('open'),null);
    await page.click('#sourceSummary');assert.equal(await page.locator('#sourceAccordion').getAttribute('open'),'');
    assert.equal(await page.locator('#formatSummary .when-closed').isVisible(),true);
    assert.equal(await page.locator('#csvSummary .when-closed').isVisible(),true);
    assert.match(await page.textContent('#csvSummary'),/转换为 CSV 文件/);
    assert.equal(await page.locator('#csvSelected').isHidden(),true,'CSV selected count must stay hidden before a DBC is loaded');
    assert.equal(await page.locator('#sourceAccordion .file-zone + .advanced').count(),1,'text encoding settings must follow the source file picker');
    assert.equal(await page.locator('.intro p').textContent(),'01 — 源文件 · 02 — 格式转换 · 03 — 信号 CSV');
    assert.equal(await page.locator('.format-strip').count(),0,'top format badges must be removed');
    await page.click('#formatSummary');assert.equal(await page.locator('#formatAccordion').getAttribute('open'),'');
    assert.equal(await page.locator('#formatSummary .when-open').isVisible(),true);
    await page.click('#formatSummary');assert.equal(await page.locator('#formatAccordion').getAttribute('open'),null);
    await page.click('#formatSummary');
    assert.equal(await page.locator('#startFormatConvert').isDisabled(),true);
    assert.equal(await page.locator('#startCsvConvert').isDisabled(),true);
    await page.evaluate(()=>scrollTo(0,700));await page.waitForTimeout(50);assert.ok(Math.abs(await page.locator('#topNav').evaluate(node=>node.getBoundingClientRect().top))<1,'navigation did not remain at viewport top while scrolling');await page.evaluate(()=>scrollTo(0,0));
    const sample=Buffer.from('base hex timestamps absolute\n0.125 1 123 Rx d 2 01 FF\n1.25 2 18FF50E5x Tx d 1 02\n');
    const logSample=Buffer.from('***HEX***\n***ABSOLUTE MODE***\n00:00:00:1000 Rx 1 0x123 s 1 02\n');
    for(const format of ['asc','log','trc','blf','txt','mf4','mdf']){
      await page.locator('#sourceFile').setInputFiles(format==='asc'?{name:'demo.log',mimeType:'text/plain',buffer:logSample}:{name:'demo.asc',mimeType:'application/octet-stream',buffer:sample});
      await page.click(`.format-card[data-format="${format}"]`);
      assert.equal(await page.inputValue('#targetFormat'),format);
      await page.click('#startFormatConvert');
      await page.locator('#result').waitFor({state:'visible'});
      assert.equal(await page.locator('#preview tr').count(),format==='asc'?1:2);
      const downloaded=page.waitForEvent('download');await page.click('#download');
      const download=await downloaded;assert.equal(download.suggestedFilename(),'demo.'+format);assert.equal(await download.failure(),null);
    }
    const dbc=Buffer.from('BO_ 291 Demo: 8 ECU\n SG_ Value : 0|8@1+ (1,0) [0|255] "V" ECU\nBO_ 2566869221 Ext: 8 ECU\n SG_ ExtValue : 0|8@1+ (0.5,0) [0|127.5] "A" ECU\n');
    await page.locator('#sourceFile').setInputFiles({name:'demo.asc',mimeType:'text/plain',buffer:sample});
    await page.click('#csvSummary');assert.equal(await page.locator('#csvAccordion').getAttribute('open'),'');
    await page.click('#csvSummary');assert.equal(await page.locator('#csvAccordion').getAttribute('open'),null);
    await page.click('#csvSummary');
    assert.equal(await page.locator('#dbcFile').getAttribute('accept'),null);
    await page.locator('#dbcFile').setInputFiles({name:'vehicle.dbc',mimeType:'text/plain',buffer:dbc});
    await page.locator('#csvSelected').waitFor({state:'visible'});
    assert.equal(await page.locator('#csvSelected').isVisible(),true,'CSV selected count must appear after a DBC is loaded');
    await page.locator('.signal-option').first().waitFor();await page.click('#selectAllSignals');await page.selectOption('#csvInterval','300');
    await page.click('#startCsvConvert');await page.locator('#result').waitFor({state:'visible'});
    const csvEvent=page.waitForEvent('download');await page.click('#download');const csvDownload=await csvEvent;
    assert.equal(csvDownload.suggestedFilename(),'demo.csv');
    const csvText=await readFile(await csvDownload.path(),'utf8');assert.match(csvText,/序号,时间,Value,ExtValue/);assert.match(csvText,/1,0\.125000,1,/);
    await page.screenshot({path:process.env.SCREENSHOT_DIR?path.join(process.env.SCREENSHOT_DIR,'convert-desktop.png'):undefined,fullPage:true});
    for(const viewport of [{width:390,height:844},{width:844,height:390}]){
      await page.setViewportSize(viewport);
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'no page horizontal overflow');
      if(process.env.SCREENSHOT_DIR)await page.screenshot({path:path.join(process.env.SCREENSHOT_DIR,'convert-'+viewport.width+'.png'),fullPage:true});
    }
    await page.locator('#sourceFile').setInputFiles([
      {name:'mixed.asc',mimeType:'text/plain',buffer:sample},
      {name:'mixed.log',mimeType:'text/plain',buffer:logSample},
      {name:'already.trc',mimeType:'text/plain',buffer:Buffer.from('ignored')}
    ]);
    assert.match(await page.textContent('#fileName'),/3 个文件/);
    await page.click('.format-card[data-format="trc"]');await page.click('#startFormatConvert');
    await page.locator('#result').waitFor({state:'visible'});
    assert.equal(await page.locator('#downloadList a').count(),2);
    assert.match(await page.textContent('#resultSummary'),/忽略 1 个同格式文件/);
    assert.deepEqual(await page.locator('#downloadList a').evaluateAll(nodes=>nodes.map(node=>node.download)),['mixed.trc','mixed.trc']);
    await page.locator('#sourceFile').setInputFiles({name:'bad.asc',mimeType:'text/plain',buffer:Buffer.from('0.1 1 123 Rx d 8 01\n')});
    await page.click('#startFormatConvert');await page.locator('#error').waitFor({state:'visible'});
    assert.equal(await page.locator('#result').isVisible(),false);
    // Cancel immediately while initial file identification is pending.
    await page.locator('#sourceFile').setInputFiles({name:'demo.asc',mimeType:'text/plain',buffer:sample});
    await page.evaluate(()=>{document.getElementById('startFormatConvert').click();document.getElementById('cancel').click();});
    assert.match(await page.textContent('#status'),/已取消/);
    assert.equal(await page.locator('#startFormatConvert').isEnabled(),true);
    assert.deepEqual(errors,[],'no conversion page script errors');
    const savePage=await browser.newPage({viewport:{width:1000,height:800}});
    await savePage.addInitScript(()=>{
      const source=new File(['base hex timestamps absolute\n0.1 1 123 Rx d 1 FF\n'],'vehicle.log.asc',{type:'text/plain'});
      const sourceHandle={kind:'file',name:source.name,getFile:async()=>source};
      window.showOpenFilePicker=async()=>[sourceHandle];
      window.showSaveFilePicker=async options=>{window.__saveTest={options,sourceHandle};return {name:options.suggestedName,createWritable:async()=>({write:async blob=>window.__saveTest.bytes=blob.size,close:async()=>window.__saveTest.closed=true})};};
    });
    await savePage.goto(base+'/convert');await savePage.click('#chooseFile');await savePage.click('#formatSummary');await savePage.click('.format-card[data-format="trc"]');await savePage.click('#startFormatConvert');
    await savePage.locator('#result').waitFor({state:'visible'});
    const saveState=await savePage.evaluate(()=>({name:__saveTest.options.suggestedName,startIn:__saveTest.options.startIn===__saveTest.sourceHandle,bytes:__saveTest.bytes,closed:__saveTest.closed,status:document.getElementById('saveResult').textContent,downloadHidden:document.getElementById('download').hidden}));
    assert.equal(saveState.name,'vehicle.log.trc');assert.equal(saveState.startIn,true);assert.ok(saveState.bytes>0);assert.equal(saveState.closed,true);assert.match(saveState.status,/原文件所在位置/);assert.equal(saveState.downloadHidden,true);
    await savePage.evaluate(()=>window.showSaveFilePicker=async options=>({name:options.suggestedName,createWritable:async()=>{throw new DOMException('denied','NotAllowedError');}}));
    await savePage.click('.format-card[data-format="blf"]');await savePage.click('#startFormatConvert');await savePage.locator('#result').waitFor({state:'visible'});
    assert.match(await savePage.textContent('#saveResult'),/写入失败/);assert.equal(await savePage.locator('#download').isVisible(),true);assert.equal(await savePage.getAttribute('#download','download'),'vehicle.log.blf');
    await savePage.close();
    await page.goto(base+'/tests/regression.html');
    await page.waitForFunction(()=>Array.isArray(window.__TEST_RESULTS__),{},{timeout:90000});
    const results=await page.evaluate(()=>window.__TEST_RESULTS__);
    console.log(JSON.stringify(results));
    assert.equal(results.every(t=>t.ok),true,'existing browser regressions');
    console.log('PASS: seven-format downloads, DBC signal CSV, source-path saves, responsive layout and existing regressions');
  }finally{await browser.close();server.close();}
})().catch(error=>{console.error(error);server.close();process.exitCode=1;});
