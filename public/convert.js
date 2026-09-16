import {parseDBC,serializableSignal} from './converters/dbc.mjs';
import {detectInputFormat,outputName,planBatch} from './converters/batch.mjs';

const $=id=>document.getElementById(id);
const descriptions={
  asc:['Vector ASCII','通用文本日志，保留时间、ID、通道与原始数据，适合导入 CAN 报文解析工具。',true],
  log:['BusMaster LOG','输出 BusMaster 经典 CAN 日志，保存收发方向、标准/扩展 ID、通道与数据。',false],
  trc:['PCAN Trace 2.1','输出 PCAN TRC 2.1 文本日志，保留 CAN FD 的 BRS / ESI 标志。',true],
  blf:['Vector Binary Logging','输出二进制 BLF 日志，使用未压缩容器，方便后续分析和交换。',true],
  txt:['周立功 TXT 表格','输出带中文表头的 UTF-8 经典 CAN 表格，数据列位于最后。',false],
  mf4:['ASAM MDF 4.10','输出原始 CAN 帧组成的 MDF 4.10 文件，可在 asammdf 中查看和继续处理。',true],
  mdf:['ASAM MDF 3.30','输出 MDF 3.30 原始 CAN 字段。若需要保存 CAN FD，请选择 MF4。',false]
};
let sources=[],dbcData=null,worker=null,urls=[],job=0,running=false;
const selectedSignals=new Set();
const size=bytes=>bytes>=1024**2?(bytes/1024**2).toFixed(1)+' MB':(bytes/1024).toFixed(1)+' KB';

function clearResult(){
  for(const value of urls)URL.revokeObjectURL(value);
  urls=[];$('download').removeAttribute('href');$('download').hidden=true;$('downloadList').replaceChildren();
  $('saveResult').textContent='';$('result').hidden=true;$('error').hidden=true;
}
function canStartFormat(){return sources.length>0;}
function canStartCsv(){return sources.length>0&&dbcData&&selectedSignals.size>0;}
function busy(active){
  running=active;
  for(const id of ['chooseFile','sourceFile','targetFormat','zeroTime','encoding','txtTimeUnit','chooseDbc','dbcFile','csvInterval','signalSearch','selectAllSignals','clearSignals'])$(id).disabled=active;
  for(const card of document.querySelectorAll('.format-card'))card.disabled=active;
  for(const input of document.querySelectorAll('.signal-list input[data-key]'))input.disabled=active||!!dbcData?.signals.find(signal=>signal.key===input.dataset.key)?.precisionUnsupported;
  $('startFormatConvert').disabled=active||!canStartFormat();$('startCsvConvert').disabled=active||!canStartCsv();$('cancel').hidden=!active;
}
async function renderSources(){
  const stamp=sources;$('fileList').replaceChildren();
  if(!sources.length)return;
  for(const source of sources){
    const row=document.createElement('div');row.className='file-item';
    const name=document.createElement('strong'),meta=document.createElement('span');name.textContent=source.file.name;meta.textContent=size(source.file.size)+' · 识别中…';row.append(name,meta);$('fileList').appendChild(row);
    try{const format=await detectInputFormat(source.file);if(sources===stamp)meta.textContent=size(source.file.size)+' · '+format.toUpperCase();}
    catch(error){if(sources===stamp)meta.textContent=size(source.file.size)+' · '+error.message;}
  }
}
function select(items){
  if(running||!items.length)return;
  sources=items;clearResult();$('statusPanel').hidden=true;
  const total=items.reduce((sum,item)=>sum+item.file.size,0);
  $('fileName').textContent=items.length===1?items[0].file.name:items.length+' 个文件已选择';
  $('fileMeta').textContent=size(total)+(total>200*1024**2?' · 大文件建议在电脑上转换':items.some(item=>item.handle)?' · 可请求保存到原目录':' · 转换后提供下载');
  renderSources();busy(false);
}
$('chooseFile').onclick=async()=>{
  if(window.showOpenFilePicker){
    try{
      const handles=await window.showOpenFilePicker({multiple:true});
      if(handles.length){select(await Promise.all(handles.map(async handle=>({file:await handle.getFile(),handle}))));return;}
    }catch(error){if(error.name==='AbortError')return;}
  }
  $('sourceFile').value='';$('sourceFile').click();
};
$('sourceFile').onchange=event=>select([...event.target.files].map(file=>({file,handle:null})));
$('dropZone').ondragover=event=>{event.preventDefault();if(!worker)$('dropZone').classList.add('drag');};
$('dropZone').ondragleave=()=> $('dropZone').classList.remove('drag');
$('dropZone').ondrop=event=>{event.preventDefault();$('dropZone').classList.remove('drag');select([...event.dataTransfer.files].map(file=>({file,handle:null})));};

function targetChanged(key){
  $('targetFormat').value=key;
  for(const card of document.querySelectorAll('.format-card'))card.setAttribute('aria-pressed',String(card.dataset.format===key));
  const [title,description,fd]=descriptions[key];
  $('targetExt').textContent='.'+key;$('targetTitle').textContent=title;$('targetDescription').textContent=description;
  $('targetCapability').textContent=fd?'支持经典 CAN、CAN FD 和远程帧':'支持经典 CAN 和远程帧';clearResult();busy(false);
}
for(const card of document.querySelectorAll('.format-card'))card.onclick=()=>targetChanged(card.dataset.format);
for(const id of ['zeroTime','encoding','txtTimeUnit','csvInterval'])$(id).onchange=clearResult;

const signalMatches=(signal,query)=>!query||(signal.name+' '+signal.messageName+' '+signal.messageId.toString(16)).toLowerCase().includes(query);
function signalLabel(signal,checked){
  const label=document.createElement('label');label.className='signal-option';
  const input=document.createElement('input');input.type='checkbox';input.dataset.key=signal.key;input.checked=checked;input.disabled=signal.precisionUnsupported;
  const wrap=document.createElement('span'),name=document.createElement('b'),meta=document.createElement('small');
  name.textContent=signal.name;meta.textContent=signal.messageName+' · 0x'+signal.messageId.toString(16).toUpperCase()+(signal.unit?' · ['+signal.unit+']':'')+(signal.precisionUnsupported?' · 超过 53 位整数精度':'');
  wrap.append(name,meta);label.append(input,wrap);return label;
}
function renderSignals(){
  const query=$('signalSearch').value.trim().toLowerCase(),available=$('signalList'),picked=$('selectedSignalList');available.replaceChildren();picked.replaceChildren();
  if(!dbcData){available.append(Object.assign(document.createElement('p'),{textContent:'请先加载 DBC 文件'}));picked.append(Object.assign(document.createElement('p'),{textContent:'勾选左侧信号后显示在此'}));$('availableCount').textContent='0';$('pickedCount').textContent='0';return;}
  const visible=dbcData.signals.filter(signal=>signalMatches(signal,query));
  const groups=new Map();
  for(const signal of visible){if(!groups.has(signal.messageKey))groups.set(signal.messageKey,[]);groups.get(signal.messageKey).push(signal);}
  for(const signals of groups.values()){
    const group=document.createElement('div');group.className='signal-group';
    const heading=document.createElement('div');heading.className='signal-group-title';heading.textContent=signals[0].messageName+' · 0x'+signals[0].messageId.toString(16).toUpperCase()+' · '+signals.length+' 个信号';group.appendChild(heading);
    for(const signal of signals)group.appendChild(signalLabel(signal,selectedSignals.has(signal.key)));available.appendChild(group);
  }
  if(!visible.length)available.append(Object.assign(document.createElement('p'),{textContent:'没有匹配的信号'}));
  const selected=dbcData.signals.filter(signal=>selectedSignals.has(signal.key));
  for(const signal of selected)picked.appendChild(signalLabel(signal,true));
  if(!selected.length)picked.append(Object.assign(document.createElement('p'),{textContent:'勾选左侧信号后显示在此'}));
  $('availableCount').textContent=visible.length;$('pickedCount').textContent=selected.length;
}
function updateCsvSelection(){
  $('csvSelected').textContent='已选 '+selectedSignals.size+' 个';renderSignals();clearResult();busy(false);
}
$('chooseDbc').onclick=()=>{$('dbcFile').value='';$('dbcFile').click();};
$('dbcFile').onchange=async event=>{
  const file=event.target.files[0];if(!file)return;
  try{dbcData=parseDBC(await file.text());selectedSignals.clear();$('dbcName').textContent=file.name+' · '+dbcData.signals.length+' 个信号';$('signalSearch').value='';$('csvSelected').hidden=false;updateCsvSelection();}
  catch(error){dbcData=null;selectedSignals.clear();$('dbcName').textContent='DBC 解析失败：'+error.message;$('csvSelected').hidden=true;updateCsvSelection();}
};
$('signalSearch').oninput=renderSignals;
for(const id of ['signalList','selectedSignalList'])$(id).onchange=event=>{
  const input=event.target.closest('input[data-key]');if(!input)return;
  if(input.checked)selectedSignals.add(input.dataset.key);else selectedSignals.delete(input.dataset.key);updateCsvSelection();
};
$('selectAllSignals').onclick=()=>{
  if(!dbcData)return;const query=$('signalSearch').value.trim().toLowerCase();
  for(const signal of dbcData.signals)if(!signal.precisionUnsupported&&signalMatches(signal,query))selectedSignals.add(signal.key);updateCsvSelection();
};
$('clearSignals').onclick=()=>{selectedSignals.clear();updateCsvSelection();};

function fail(message){
  $('error').textContent=message.includes('encoded data')?message+'；中文旧日志可尝试 GBK / GB18030 编码。':message;
  $('error').hidden=false;$('statusPanel').hidden=true;worker?.terminate();worker=null;busy(false);
}
async function requestOutputHandle(source,name,extension){
  if(!source.handle||!window.showSaveFilePicker)return {handle:null,reason:'当前浏览器无法访问原文件目录，转换结果可通过下方按钮下载。'};
  try{return {handle:await window.showSaveFilePicker({suggestedName:name,startIn:source.handle,types:[{description:extension.toUpperCase()+' 文件',accept:{'application/octet-stream':['.'+extension]}}]}),reason:''};}
  catch(error){return {handle:null,reason:error.name==='AbortError'?'未确认保存位置，转换结果可通过下方按钮下载。':'无法取得原目录写入权限，转换结果可通过下方按钮下载。'};}
}
function workerConvert(item,output,signals,current,index,total){
  return new Promise((resolve,reject)=>{
    worker=new Worker(new URL('./convert-worker.mjs',import.meta.url),{type:'module'});
    $('status').textContent=`正在转换第 ${index+1}/${total} 个：${item.input.toUpperCase()} → ${output.toUpperCase()}…`;
    worker.onerror=()=>reject(Error('转换线程无法运行。请刷新页面；若文件较大，建议使用电脑浏览器重试。'));
    worker.onmessage=({data})=>{
      if(current!==job){worker?.terminate();worker=null;return reject(Error('已取消'));}
      if(data.type==='progress')$('progress').value=(index+data.value)/total;
      else if(data.type==='frames')$('status').textContent=`第 ${index+1}/${total} 个文件已转换 ${data.frames.toLocaleString()} 帧…`;
      else if(data.type==='error'){worker.terminate();worker=null;reject(Error(item.file.name+'：'+data.message));}
      else if(data.type==='done'){worker.terminate();worker=null;resolve(data);}
    };
    worker.postMessage({file:item.file,input:item.input,output,options:{encoding:$('encoding').value,txtTimeUnit:$('txtTimeUnit').value,zeroTime:$('zeroTime').checked,intervalMs:Number($('csvInterval').value),signals}});
  });
}
async function saveOrOffer(source,blob,name,output,preparedDestination=null){
  const destination=preparedDestination||await requestOutputHandle(source,name,output);
  if(destination.handle){
    let writable;
    try{writable=await destination.handle.createWritable();await writable.write(blob);await writable.close();return {saved:true,message:'已按原文件所在位置保存为 '+name};}
    catch{try{await writable?.abort();}catch{}return {saved:false,message:'原目录写入失败，已改为提供下载。'};}
  }
  return {saved:false,message:destination.reason};
}
function addDownloads(entries){
  $('downloadList').replaceChildren();$('download').hidden=true;
  const pending=entries.filter(entry=>!entry.saved);
  for(const entry of pending){entry.url=URL.createObjectURL(entry.blob);urls.push(entry.url);}
  if(pending.length===1){$('download').href=pending[0].url;$('download').download=pending[0].name;$('download').hidden=false;return;}
  for(const entry of pending){const link=document.createElement('a');link.className='secondary';link.href=entry.url;link.download=entry.name;link.textContent='下载 '+entry.name;$('downloadList').appendChild(link);}
}
function renderPreview(data){
  const rawHeaders=['时间 / s','通道','CAN ID','方向','类型','数据 / hex'];$('previewHead').replaceChildren();
  for(const value of data.csv?data.csv.headers:rawHeaders){const cell=document.createElement('th');cell.textContent=value;$('previewHead').appendChild(cell);}
  $('previewCaption').textContent=data.csv?'首个结果的前 8 行 CSV 预览':'首个结果的前 8 帧预览';$('preview').replaceChildren();
  if(data.csv){for(const values of data.csv.rows){const row=document.createElement('tr');for(const value of values){const cell=document.createElement('td');cell.textContent=value;row.appendChild(cell);}$('preview').appendChild(row);}}
  else for(const frame of data.preview){const row=document.createElement('tr');for(const value of [frame.time.toFixed(6),frame.channel,frame.id.toString(16).toUpperCase().padStart(frame.extended?8:3,'0'),frame.rx?'Rx':'Tx',frame.remote?'远程帧':frame.fd?'CAN FD':'CAN',frame.data.map(byte=>byte.toString(16).toUpperCase().padStart(2,'0')).join(' ')||'—']){const cell=document.createElement('td');cell.textContent=value;row.appendChild(cell);}$('preview').appendChild(row);}
}
async function run(output){
  if(running||!sources.length)return;clearResult();busy(true);$('statusPanel').hidden=false;$('progress').value=0;const current=++job;
  try{
    const selectedExtension=sources.length===1&&sources[0].file.name.includes('.')?sources[0].file.name.split('.').pop().toLowerCase():'';
    if(output!=='csv'&&selectedExtension===output)throw Error('所选文件格式与目标格式一致，已忽略，无需转换');
    // For a single file, open the save dialog while the button click still provides user activation.
    const preparedDestination=sources.length===1?await requestOutputHandle(sources[0],outputName(sources[0].file,output),output):null;
    if(current!==job)return;
    const plan=output==='csv'?{convert:await Promise.all(sources.map(async source=>({file:source.file,input:await detectInputFormat(source.file),output:'csv',outputName:outputName(source.file,'csv')}))),skipped:[]}:await planBatch(sources.map(source=>source.file),output);
    if(current!==job)return;
    if(!plan.convert.length)throw Error('所选文件格式均与目标格式一致，已全部忽略，无需转换');
    const signalOptions=output==='csv'?dbcData.signals.filter(signal=>selectedSignals.has(signal.key)).map(serializableSignal):[];
    const entries=[],warnings=new Set();let frames=0,rows=0;
    for(let index=0;index<plan.convert.length;index++){
      const item=plan.convert[index],source=sources.find(value=>value.file===item.file),data=await workerConvert(item,output,signalOptions,current,index,plan.convert.length);
      const saved=await saveOrOffer(source,data.blob,item.outputName,output,index===0?preparedDestination:null);entries.push({blob:data.blob,name:item.outputName,data,...saved});frames+=data.stats.frames;rows+=data.stats.rows||0;for(const warning of data.warnings)warnings.add(warning);
    }
    if(current!==job)return;busy(false);$('progress').value=1;$('status').textContent='全部转换完成。';addDownloads(entries);
    $('saveResult').textContent=entries.map(entry=>entry.message).filter((value,index,list)=>list.indexOf(value)===index).join('；');
    $('resultSummary').textContent=output==='csv'?`${entries.length} 个文件 · ${frames.toLocaleString()} 帧 · ${rows.toLocaleString()} 行 · ${selectedSignals.size} 个信号 · ${$('csvInterval').value} ms`:`${entries.length} 个文件转换完成 · ${frames.toLocaleString()} 帧${plan.skipped.length?' · 忽略 '+plan.skipped.length+' 个同格式文件':''}`;
    $('conversionWarnings').textContent=[...warnings].join('；');$('conversionWarnings').hidden=!warnings.size;renderPreview(entries[0].data);$('result').hidden=false;$('result').scrollIntoView({block:'nearest',behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});
  }catch(error){if(current===job)fail(error.message);}
}
$('startFormatConvert').onclick=()=>run($('targetFormat').value);
$('startCsvConvert').onclick=()=>run('csv');
$('cancel').onclick=()=>{job++;worker?.terminate();worker=null;busy(false);$('statusPanel').hidden=false;$('status').textContent='已取消，原文件未改动。';$('progress').value=0;};
window.addEventListener('pagehide',()=>{job++;worker?.terminate();worker=null;for(const value of urls)URL.revokeObjectURL(value);urls=[];});
window.addEventListener('pageshow',event=>{if(event.persisted){clearResult();$('statusPanel').hidden=true;busy(false);}});
let noticeTimer;
$('topNav').addEventListener('click',event=>{if(!event.target.closest('.nav-item.pending'))return;const notice=$('navNotice');notice.textContent='页面还未完成开发，不急不急～';notice.style.left=Math.min(Math.max(8,event.clientX),Math.max(8,innerWidth-290))+'px';notice.style.top=Math.max(8,event.clientY+12)+'px';notice.classList.add('show');clearTimeout(noticeTimer);noticeTimer=setTimeout(()=>notice.classList.remove('show'),1850);});
