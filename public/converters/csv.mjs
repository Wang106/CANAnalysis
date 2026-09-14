import {Parts} from './utils.mjs';
import {decodeSignal,signalActive} from './dbc.mjs';

const INTERVALS=new Set([100,200,300,400,500,600,700,800,900,1000]);
const csv=value=>{const text=String(value??'');return /[",\r\n]/.test(text)?'"'+text.replaceAll('"','""')+'"':text;};
const number=value=>Object.is(value,-0)?'0':Number.isFinite(value)?String(value):'';

export async function convertCsv(frames,options={}){
  const signals=options.signals||[],intervalMs=Number(options.intervalMs);
  if(!signals.length)throw Error('请先加载 DBC 并至少选择一个信号');
  if(!INTERVALS.has(intervalMs))throw Error('CSV 时间间隔必须为 100–1000 ms，步进 100 ms');
  for(const signal of signals)if(signal.precisionUnsupported)throw Error('信号 '+signal.name+' 超过 53 位整数精度，无法可靠导出');
  const counts=new Map();for(const signal of signals)counts.set(signal.name,(counts.get(signal.name)||0)+1);
  const headers=signals.map(signal=>counts.get(signal.name)>1?signal.messageName+'.'+signal.name:signal.name);
  const output=new Parts();output.add('\uFEFF'+['序号','时间',...headers].map(csv).join(',')+'\r\n');
  const byMessage=new Map();signals.forEach((signal,index)=>{const list=byMessage.get(signal.messageKey)||[];list.push({signal,index});byMessage.set(signal.messageKey,list);});
  const values=Array(signals.length).fill(''),previewRows=[],channels=new Set(),warnings=options.warnings||new Set();
  const stats={frames:0,rows:0,fd:0,remote:0,channels:[],first:null,last:null,intervalMs};
  const step=intervalMs/1000;let origin=null,start=null,nextIndex=0,lastFrameTime=-Infinity,groupTime=null,group=[];
  const emit=time=>{const row=[++stats.rows,time.toFixed(6),...values.map(number)];output.add(row.map(csv).join(',')+'\r\n');if(previewRows.length<8)previewRows.push(row);};
  const flush=()=>{
    if(groupTime===null)return;
    let next=start+nextIndex*step;
    if(Math.floor((groupTime-start)/step)-nextIndex>10000000)throw Error('CSV 时间范围将产生超过 1000 万行，请增大时间间隔或缩短日志');
    while(next<groupTime-1e-10){emit(next);next=start+(++nextIndex)*step;}
    for(const frame of group){
      if(frame.remote)continue;
      const matches=byMessage.get(frame.id+'_'+(frame.extended?'x':'s'))||[];
      for(const {signal,index} of matches)if(signalActive(frame.data,signal))values[index]=decodeSignal(frame.data,signal);
    }
    next=start+nextIndex*step;if(next<=groupTime+1e-10){emit(next);nextIndex++;}
    group=[];
  };
  for await(const sourceFrame of frames){
    const frame={...sourceFrame};origin??=frame.time;if(options.zeroTime)frame.time-=origin;
    if(frame.time<lastFrameTime)throw Error('CAN 日志时间不是递增顺序，无法按固定间隔导出 CSV');
    lastFrameTime=frame.time;stats.frames++;stats.fd+=+frame.fd;stats.remote+=+frame.remote;channels.add(frame.channel);
    stats.first=stats.first===null?frame.time:stats.first;stats.last=frame.time;start??=frame.time;
    if(groupTime===null)groupTime=frame.time;
    if(frame.time>groupTime+1e-10){flush();groupTime=frame.time;}
    group.push(frame);if(stats.frames%10000===0)options.onFrames?.(stats.frames);
  }
  flush();
  if(!stats.frames)throw Error('未找到可转换的 CAN 报文，请检查文件内容和输入格式');
  stats.channels=[...channels].sort((a,b)=>a-b);
  if(values.every(value=>value===''))warnings.add('所选信号在日志中没有匹配数据，CSV 数值列为空');
  return {blob:output.blob(),stats,warnings:[...warnings],preview:[],csv:{headers:['序号','时间',...headers],rows:previewRows}};
}
