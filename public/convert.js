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
let selectedFile=null,worker=null,url=null,job=0,running=false;
const size=bytes=>bytes>=1024**2?(bytes/1024**2).toFixed(1)+' MB':(bytes/1024).toFixed(1)+' KB';
function clearResult(){if(url){URL.revokeObjectURL(url);url=null;}$('download').removeAttribute('href');$('result').hidden=true;$('error').hidden=true;}
function busy(active){running=active;for(const id of ['chooseFile','sourceFile','sourceFormat','targetFormat','zeroTime','encoding','txtTimeUnit'])$(id).disabled=active;$('startConvert').disabled=active||!selectedFile;$('cancel').hidden=!active;}
function select(file){if(running||!file)return;selectedFile=file;clearResult();$('statusPanel').hidden=true;$('fileName').textContent=file.name;$('fileMeta').textContent=size(file.size)+(file.size>200*1024**2?' · 大文件建议在电脑上转换':' · 已选择');busy(false);}
$('chooseFile').onclick=()=>{$('sourceFile').value='';$('sourceFile').click();};
$('sourceFile').onchange=event=>select(event.target.files[0]);
$('dropZone').ondragover=event=>{event.preventDefault();if(!worker)$('dropZone').classList.add('drag');};
$('dropZone').ondragleave=()=> $('dropZone').classList.remove('drag');
$('dropZone').ondrop=event=>{event.preventDefault();$('dropZone').classList.remove('drag');select(event.dataTransfer.files[0]);};
function targetChanged(){const key=$('targetFormat').value,[title,description,fd]=descriptions[key];$('targetExt').textContent='.'+key;$('targetTitle').textContent=title;$('targetDescription').textContent=description;$('targetCapability').textContent=fd?'支持经典 CAN、CAN FD 和远程帧':'支持经典 CAN 和远程帧';clearResult();}
$('targetFormat').onchange=targetChanged;
for(const id of ['sourceFormat','zeroTime','encoding','txtTimeUnit'])$(id).onchange=clearResult;
function fail(message){$('error').textContent=message.includes('encoded data')?message+'；中文旧日志可尝试 GBK / GB18030 编码。':message;$('error').hidden=false;$('statusPanel').hidden=true;worker?.terminate();worker=null;busy(false);}
$('startConvert').onclick=async()=>{
  if(!selectedFile||running)return;clearResult();busy(true);$('statusPanel').hidden=false;$('status').textContent='正在识别文件…';$('progress').removeAttribute('value');const current=++job;
  try{
    const file=selectedFile;let input=$('sourceFormat').value;
    if(input==='auto'){
      const head=new Uint8Array(await file.slice(0,64).arrayBuffer()),signature=new TextDecoder().decode(head.subarray(0,8));
      if(signature.startsWith('LOGG'))input='blf';
      else if(signature==='MDF     ')input=new DataView(head.buffer).getUint16(28,true)>=400?'mf4':'mdf';
      else input=file.name.split('.').pop().toLowerCase();
    }
    if(current!==job)return;
    if(!descriptions[input])throw Error('无法自动识别此文件，请手动选择源文件格式');
    const output=$('targetFormat').value;
    worker=new Worker(new URL('./convert-worker.mjs',import.meta.url),{type:'module'});
    $('status').textContent='正在转换 '+input.toUpperCase()+' → '+output.toUpperCase()+'…';
    worker.onerror=()=>fail('转换线程无法运行。请刷新页面；若文件较大，建议使用电脑浏览器重试。');
    worker.onmessage=({data})=>{
      if(current!==job)return;
      if(data.type==='progress')$('progress').value=data.value;
      else if(data.type==='frames')$('status').textContent='已转换 '+data.frames.toLocaleString()+' 帧…';
      else if(data.type==='error')fail(data.message);
      else if(data.type==='done'){
        worker.terminate();worker=null;busy(false);$('progress').value=1;$('status').textContent='转换完成，可以下载。';
        url=URL.createObjectURL(data.blob);$('download').href=url;$('download').download=file.name.replace(/\.[^.]+$/,'')+'_converted.'+output;
        $('resultSummary').textContent=`${data.stats.frames.toLocaleString()} 帧 · 通道 ${data.stats.channels.join('、')} · ${size(data.blob.size)} · CAN FD ${data.stats.fd.toLocaleString()} 帧`;
        $('conversionWarnings').textContent=data.warnings.join('；');$('conversionWarnings').hidden=!data.warnings.length;
        $('preview').replaceChildren();for(const f of data.preview){const row=document.createElement('tr');for(const value of [f.time.toFixed(6),f.channel,f.id.toString(16).toUpperCase().padStart(f.extended?8:3,'0'),f.rx?'Rx':'Tx',f.remote?'远程帧':f.fd?'CAN FD':'CAN',f.data.map(b=>b.toString(16).toUpperCase().padStart(2,'0')).join(' ')||'—']){const cell=document.createElement('td');cell.textContent=value;row.appendChild(cell);}$('preview').appendChild(row);}
        $('result').hidden=false;$('result').scrollIntoView({block:'nearest',behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});
      }
    };
    worker.postMessage({file,input,output,options:{encoding:$('encoding').value,txtTimeUnit:$('txtTimeUnit').value,zeroTime:$('zeroTime').checked}});
  }catch(error){if(current===job)fail(error.message);}
};
$('cancel').onclick=()=>{job++;worker?.terminate();worker=null;busy(false);$('statusPanel').hidden=false;$('status').textContent='已取消，原文件未改动。';$('progress').value=0;};
window.addEventListener('pagehide',()=>{job++;worker?.terminate();worker=null;if(url){URL.revokeObjectURL(url);url=null;}});
window.addEventListener('pageshow',event=>{if(event.persisted){clearResult();$('statusPanel').hidden=true;busy(false);}});
let noticeTimer;
$('topNav').addEventListener('click',event=>{if(!event.target.closest('.nav-item.pending'))return;const notice=$('navNotice');notice.textContent='页面还未完成开发，不急不急～';notice.style.left=Math.min(Math.max(8,event.clientX),Math.max(8,innerWidth-290))+'px';notice.style.top=Math.max(8,event.clientY+12)+'px';notice.classList.add('show');clearTimeout(noticeTimer);noticeTimer=setTimeout(()=>notice.classList.remove('show'),1850);});
