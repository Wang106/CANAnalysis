import {readText,textWriter} from './text.mjs';
import {readBLF,blfWriter} from './blf.mjs';
import {readMDF,mdfWriter} from './mdf.mjs';
import {convertCsv} from './csv.mjs';
export const FORMATS=['asc','log','trc','blf','txt','mf4','mdf'];
export const OUTPUT_FORMATS=[...FORMATS,'csv'];
export async function* readFrames(blob,format,options={}){
  if(!FORMATS.includes(format))throw Error('请选择支持的输入格式');
  if(format==='blf')yield* readBLF(blob,options);
  else if(['mf4','mdf'].includes(format))yield* readMDF(blob,options);
  else yield* readText(blob,format,options);
}
export async function convert(blob,input,output,options={}){
  if(!OUTPUT_FORMATS.includes(output))throw Error('请选择支持的输出格式');
  if(output==='csv'){
    const warnings=new Set();
    return convertCsv(readFrames(blob,input,{...options,warn:message=>warnings.add(message)}),{...options,warnings});
  }
  const writer=output==='blf'?blfWriter():['mf4','mdf'].includes(output)?mdfWriter(output==='mf4'?4:3):textWriter(output);
  const stats={frames:0,fd:0,remote:0,channels:[],first:null,last:null},warnings=new Set(),channels=new Set(),preview=[];
  let origin=null;
  for await(const frame of readFrames(blob,input,{...options,warn:message=>warnings.add(message)})){
    if(options.zeroTime){origin??=frame.time;frame.time-=origin;if(frame.time<0)throw Error('输入时间顺序异常，无法按首帧归零');}
    if(['log','trc'].includes(output)){
      const scale=output==='log'?1e4:1e6,rounded=Math.round(frame.time*scale)/scale;
      if(Math.abs(rounded-frame.time)>1e-10)warnings.add(output==='log'?'BusMaster LOG 时间已按格式精度四舍五入到 0.1 毫秒':'PCAN TRC 时间已按格式精度四舍五入到 1 微秒');
      frame.time=rounded;
    }
    writer.add(frame);stats.frames++;stats.fd+=+frame.fd;stats.remote+=+frame.remote;channels.add(frame.channel);
    stats.first=stats.first===null?frame.time:Math.min(stats.first,frame.time);stats.last=stats.last===null?frame.time:Math.max(stats.last,frame.time);
    if(preview.length<8)preview.push({...frame,data:[...frame.data]});
    if(stats.frames%10000===0)options.onFrames?.(stats.frames);
  }
  if(!stats.frames)throw Error('未找到可转换的 CAN 报文，请检查文件内容和输入格式');
  stats.channels=[...channels].sort((a,b)=>a-b);
  return {blob:writer.finish(),stats,warnings:[...warnings],preview};
}
