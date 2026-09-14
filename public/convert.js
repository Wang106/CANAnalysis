import {parseDBC,serializableSignal} from './converters/dbc.mjs';
const $=id=>document.getElementById(id);
const descriptions={
  asc:['Vector ASCII','通用文本日志，保留时间、ID、通道与原始数据，适合导入 CAN 报文解析工具。',true],
  log:['BusMaster LOG','输出 BusMaster 经典 CAN 日志，保存收发方向、标准/扩展 ID、通道与数据。',false],
  trc:['PCAN Trace 2.1','输出 PCAN TRC 2.1 文本日志，保留 CAN FD 的 BRS / ESI 标志。',true],
  blf:['Vector Binary Logging','输出二进制 BLF 日志，使用未压缩容器，方便后续分析和交换。',true],
  txt:['周立功 TXT 表格','输出带中文表头的 UTF-8 经典 CAN 表格，数据列位于最后。',false],
  mf4:['ASAM MDF 4.10','输出原始 CAN 帧组成的 MDF 4.10 文件，可在 asammdf 中查看和继续处理。',true],
  mdf:['ASAM MDF 3.30','输出 MDF 3.30 原始 CAN 字段。若需要保存 CAN FD，请选择 MF4。',false],
  csv:['DBC 信号 CSV','根据 DBC 解码所选信号，并按固定时间间隔输出宽表 CSV。',true]
};
let selectedFile=null,sourceHandle=null,dbcData=null,worker=null,url=null,job=0,running=false;
const selectedSignals=new Set();
const size=bytes=>bytes>=1024**2?(bytes/1024**2).toFixed(1)+' MB':(bytes/1024).toFixed(1)+' KB';
const outputName=(file,extension)=>{const dot=file.name.lastIndexOf('.'),base=dot>0?file.name.slice(0,dot):file.name;return base+'.'+extension;};
function clearResult(){if(url){URL.revokeObjectURL(url);url=null;}$('download').removeAttribute('href');$('download').hidden=false;$('saveResult').textContent='';$('result').hidden=true;$('error').hidden=true;}
function canStart(){return !!selectedFile&&($('targetFormat').value!=='csv'||(dbcData&&selectedSignals.size));}
function busy(active){running=active;for(const id of ['chooseFile','sourceFile','sourceFormat','targetFormat','zeroTime','encoding','txtTimeUnit','chooseDbc','dbcFile','csvInterval','signalSearch','selectAllSignals','clearSignals'])$(id).disabled=active;for(const input of document.querySelectorAll('#signalList input[data-key]'))input.disabled=active||!!dbcData?.signals.find(signal=>signal.key===input.dataset.key)?.precisionUnsupported;$('startConvert').disabled=active||!canStart();$('cancel').hidden=!active;}
function select(file,handle=null){if(running||!file)return;selectedFile=file;sourceHandle=handle;clearResult();$('statusPanel').hidden=true;$('fileName').textContent=file.name;$('fileMeta').textContent=size(file.size)+(file.size>200*1024**2?' · 大文件建议在电脑上转换':handle?' · 可请求保存到原目录':' · 转换后提供下载');busy(false);}
$('chooseFile').onclick=async()=>{
  if(window.showOpenFilePicker){
    try{const [handle]=await window.showOpenFilePicker({multiple:false});if(handle){select(await handle.getFile(),handle);return;}}
    catch(error){if(error.name==='AbortError')return;}
  }
  sourceHandle=null;$('sourceFile').value='';$('sourceFile').click();
};
$('sourceFile').onchange=event=>select(event.target.files[0],null);
$('dropZone').ondragover=event=>{event.preventDefault();if(!worker)$('dropZone').classList.add('drag');};
$('dropZone').ondragleave=()=> $('dropZone').classList.remove('drag');
$('dropZone').ondrop=event=>{event.preventDefault();$('dropZone').classList.remove('drag');select(event.dataTransfer.files[0],null);};
function targetChanged(){const key=$('targetFormat').value,[title,description,fd]=descriptions[key];$('targetExt').textContent='.'+key;$('targetTitle').textContent=title;$('targetDescription').textContent=description;$('targetCapability').textContent=key==='csv'?'支持 DBC Intel / Motorola、带符号、缩放和复用信号':fd?'支持经典 CAN、CAN FD 和远程帧':'支持经典 CAN 和远程帧';$('csvOptions').hidden=key!=='csv';clearResult();busy(false);}
$('targetFormat').onchange=targetChanged;
for(const id of ['sourceFormat','zeroTime','encoding','txtTimeUnit','csvInterval'])$(id).onchange=clearResult;

function renderSignals(){
  const query=$('signalSearch').value.trim().toLowerCase(),list=$('signalList');list.replaceChildren();
  if(!dbcData){const p=document.createElement('p');p.textContent='加载 DBC 后显示信号列表。';list.appendChild(p);return;}
  const visible=dbcData.signals.filter(signal=>!query||(signal.name+' '+signal.messageName+' '+signal.messageId.toString(16)).toLowerCase().includes(query));
  if(!visible.length){const p=document.createElement('p');p.textContent='没有匹配的信号。';list.appendChild(p);return;}
  for(const signal of visible){
    const label=document.createElement('label');label.className='signal-option';
    const input=document.createElement('input');input.type='checkbox';input.dataset.key=signal.key;input.checked=selectedSignals.has(signal.key);input.disabled=signal.precisionUnsupported;
    const wrap=document.createElement('span'),name=document.createElement('b'),meta=document.createElement('small');name.textContent=signal.name;meta.textContent=signal.messageName+' · 0x'+signal.messageId.toString(16).toUpperCase()+(signal.unit?' · '+signal.unit:'')+(signal.precisionUnsupported?' · 超过 53 位整数精度':'');
    wrap.append(name,meta);label.append(input,wrap);list.appendChild(label);
  }
}
function updateCsvSelection(){
  $('csvSelected').textContent='已选 '+selectedSignals.size+' 个';clearResult();busy(false);
}
$('chooseDbc').onclick=()=>{$('dbcFile').value='';$('dbcFile').click();};
$('dbcFile').onchange=async event=>{
  const file=event.target.files[0];if(!file)return;
  try{dbcData=parseDBC(await file.text());selectedSignals.clear();$('dbcName').textContent=file.name+' · '+dbcData.signals.length+' 个信号';$('signalSearch').value='';renderSignals();updateCsvSelection();}
  catch(error){dbcData=null;selectedSignals.clear();$('dbcName').textContent='DBC 解析失败：'+error.message;renderSignals();updateCsvSelection();}
};
$('signalSearch').oninput=renderSignals;
$('signalList').onchange=event=>{const input=event.target.closest('input[data-key]');if(!input)return;if(input.checked)selectedSignals.add(input.dataset.key);else selectedSignals.delete(input.dataset.key);updateCsvSelection();};
$('selectAllSignals').onclick=()=>{if(!dbcData)return;const query=$('signalSearch').value.trim().toLowerCase();for(const signal of dbcData.signals)if(!signal.precisionUnsupported&&(!query||(signal.name+' '+signal.messageName+' '+signal.messageId.toString(16)).toLowerCase().includes(query)))selectedSignals.add(signal.key);renderSignals();updateCsvSelection();};
$('clearSignals').onclick=()=>{selectedSignals.clear();renderSignals();updateCsvSelection();};
function fail(message){$('error').textContent=message.includes('encoded data')?message+'；中文旧日志可尝试 GBK / GB18030 编码。':message;$('error').hidden=false;$('statusPanel').hidden=true;worker?.terminate();worker=null;busy(false);}
async function requestOutputHandle(name,extension){
  if(!sourceHandle||!window.showSaveFilePicker)return {handle:null,reason:'当前浏览器无法访问原文件目录，转换结果可通过下方按钮下载。'};
  try{
    const handle=await window.showSaveFilePicker({suggestedName:name,startIn:sourceHandle,types:[{description:extension.toUpperCase()+' 文件',accept:{'application/octet-stream':['.'+extension]}}]});
    return {handle,reason:''};
  }catch(error){
    if(error.name==='AbortError')return {handle:null,reason:'未确认保存位置，转换结果可通过下方按钮下载。'};
    return {handle:null,reason:'无法取得原目录写入权限，转换结果可通过下方按钮下载。'};
  }
}
function offerDownload(blob,name,message){
  url=URL.createObjectURL(blob);$('download').href=url;$('download').download=name;$('download').hidden=false;$('saveResult').textContent=message;
}
$('startConvert').onclick=async()=>{
  if(!canStart()||running)return;clearResult();busy(true);$('statusPanel').hidden=false;$('status').textContent='正在识别文件…';$('progress').removeAttribute('value');const current=++job;
  try{
    const file=selectedFile,output=$('targetFormat').value,name=outputName(file,output);
    // Save picker requires a user gesture, so request the destination before worker conversion starts.
    const destination=await requestOutputHandle(name,output);
    if(current!==job)return;
    let input=$('sourceFormat').value;
    if(input==='auto'){
      const head=new Uint8Array(await file.slice(0,64).arrayBuffer()),signature=new TextDecoder().decode(head.subarray(0,8));
      if(signature.startsWith('LOGG'))input='blf';
      else if(signature==='MDF     ')input=new DataView(head.buffer).getUint16(28,true)>=400?'mf4':'mdf';
      else input=file.name.split('.').pop().toLowerCase();
    }
    if(current!==job)return;
    if(!descriptions[input]||input==='csv')throw Error('无法自动识别此文件，请手动选择源文件格式');
    worker=new Worker(new URL('./convert-worker.mjs',import.meta.url),{type:'module'});
    $('status').textContent='正在转换 '+input.toUpperCase()+' → '+output.toUpperCase()+'…';
    worker.onerror=()=>fail('转换线程无法运行。请刷新页面；若文件较大，建议使用电脑浏览器重试。');
    worker.onmessage=async({data})=>{
      if(current!==job)return;
      if(data.type==='progress')$('progress').value=data.value;
      else if(data.type==='frames')$('status').textContent='已转换 '+data.frames.toLocaleString()+' 帧…';
      else if(data.type==='error')fail(data.message);
      else if(data.type==='done'){
        worker.terminate();worker=null;$('progress').value=1;
        if(destination.handle){
          $('status').textContent='转换完成，正在保存…';
          let writable;
          try{writable=await destination.handle.createWritable();await writable.write(data.blob);await writable.close();$('download').hidden=true;$('saveResult').textContent='已按原文件所在位置保存为 '+name;$('status').textContent='转换并保存完成。';}
          catch(error){try{await writable?.abort();}catch{}offerDownload(data.blob,name,'原目录写入失败，已改为提供下载。');$('status').textContent='转换完成，请下载文件。';}
        }else{offerDownload(data.blob,name,destination.reason);$('status').textContent='转换完成，请下载文件。';}
        if(current!==job)return;busy(false);
        $('resultSummary').textContent=data.csv?`${data.stats.frames.toLocaleString()} 帧 · ${data.stats.rows.toLocaleString()} 行 · ${selectedSignals.size} 个信号 · ${data.stats.intervalMs} ms · ${size(data.blob.size)}`:`${data.stats.frames.toLocaleString()} 帧 · 通道 ${data.stats.channels.join('、')} · ${size(data.blob.size)} · CAN FD ${data.stats.fd.toLocaleString()} 帧`;
        $('conversionWarnings').textContent=data.warnings.join('；');$('conversionWarnings').hidden=!data.warnings.length;
        const rawHeaders=['时间 / s','通道','CAN ID','方向','类型','数据 / hex'];$('previewHead').replaceChildren();
        for(const value of data.csv?data.csv.headers:rawHeaders){const cell=document.createElement('th');cell.textContent=value;$('previewHead').appendChild(cell);}
        $('previewCaption').textContent=data.csv?'前 8 行 CSV 预览':'前 8 帧预览';$('preview').replaceChildren();
        if(data.csv){for(const values of data.csv.rows){const row=document.createElement('tr');for(const value of values){const cell=document.createElement('td');cell.textContent=value;row.appendChild(cell);}$('preview').appendChild(row);}}
        else for(const f of data.preview){const row=document.createElement('tr');for(const value of [f.time.toFixed(6),f.channel,f.id.toString(16).toUpperCase().padStart(f.extended?8:3,'0'),f.rx?'Rx':'Tx',f.remote?'远程帧':f.fd?'CAN FD':'CAN',f.data.map(b=>b.toString(16).toUpperCase().padStart(2,'0')).join(' ')||'—']){const cell=document.createElement('td');cell.textContent=value;row.appendChild(cell);}$('preview').appendChild(row);}
        $('result').hidden=false;$('result').scrollIntoView({block:'nearest',behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});
      }
    };
    const signals=output==='csv'?dbcData.signals.filter(signal=>selectedSignals.has(signal.key)).map(serializableSignal):[];
    worker.postMessage({file,input,output,options:{encoding:$('encoding').value,txtTimeUnit:$('txtTimeUnit').value,zeroTime:$('zeroTime').checked,intervalMs:Number($('csvInterval').value),signals}});
  }catch(error){if(current===job)fail(error.message);}
};
$('cancel').onclick=()=>{job++;worker?.terminate();worker=null;busy(false);$('statusPanel').hidden=false;$('status').textContent='已取消，原文件未改动。';$('progress').value=0;};
window.addEventListener('pagehide',()=>{job++;worker?.terminate();worker=null;if(url){URL.revokeObjectURL(url);url=null;}});
window.addEventListener('pageshow',event=>{if(event.persisted){clearResult();$('statusPanel').hidden=true;busy(false);}});
let noticeTimer;
$('topNav').addEventListener('click',event=>{if(!event.target.closest('.nav-item.pending'))return;const notice=$('navNotice');notice.textContent='页面还未完成开发，不急不急～';notice.style.left=Math.min(Math.max(8,event.clientX),Math.max(8,innerWidth-290))+'px';notice.style.top=Math.max(8,event.clientY+12)+'px';notice.classList.add('show');clearTimeout(noticeTimer);noticeTimer=setTimeout(()=>notice.classList.remove('show'),1850);});
