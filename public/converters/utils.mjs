export const DLC_LENGTHS=[0,1,2,3,4,5,6,7,8,12,16,20,24,32,48,64];
export const enc=new TextEncoder();
export const ascii=(bytes,start=0,length=bytes.length-start)=>new TextDecoder().decode(bytes.subarray(start,start+length)).replace(/\0.*$/s,'');
export const view=bytes=>new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
export const hex=(value,width=2)=>value.toString(16).toUpperCase().padStart(width,'0');
export const uint=(token,base=10)=>{
  const text=String(token).replace(/^0x/i,'');
  if(!(base===16?/^[\da-f]+$/i:/^\d+$/).test(text))throw Error('无效数字：'+token);
  const n=parseInt(text,base);if(!Number.isSafeInteger(n))throw Error('数字超出安全范围');return n;
};
export function bytesFrom(tokens,length){
  if(tokens.length<length)throw Error('数据长度不足，期望 '+length+' 字节');
  return Uint8Array.from(tokens.slice(0,length),token=>{
    if(!/^[0-9a-f]{2}$/i.test(token))throw Error('无效数据字节：'+token);
    return parseInt(token,16);
  });
}
export function frame(value){
  const f={time:0,id:0,channel:1,extended:false,rx:true,remote:false,fd:false,brs:false,esi:false,data:new Uint8Array(),...value};
  f.dlc??=f.fd?DLC_LENGTHS.indexOf(f.data.length):f.data.length;
  if(!Number.isFinite(f.time)||f.time<0)throw Error('时间戳必须是非负数');
  if(!Number.isInteger(f.id)||f.id<0||f.id>(f.extended?0x1fffffff:0x7ff))throw Error('CAN ID 超出帧格式范围');
  if(!Number.isInteger(f.channel)||f.channel<1||f.channel>65535)throw Error('通道号必须在 1–65535 之间');
  if(!Number.isInteger(f.dlc)||f.dlc<0||f.dlc>(f.fd?15:8))throw Error('无效 DLC');
  if(f.fd&&f.remote)throw Error('CAN FD 不支持远程帧');
  if(f.remote?f.data.length!==0:f.data.length!==(f.fd?DLC_LENGTHS[f.dlc]:f.dlc))throw Error('DLC 与数据长度不一致');
  return f;
}
export async function read(blob,offset,length){
  if(!Number.isSafeInteger(offset)||!Number.isSafeInteger(length)||offset<0||length<0||offset+length>blob.size)throw Error('文件截断或损坏：读取范围超界');
  return new Uint8Array(await blob.slice(offset,offset+length).arrayBuffer());
}
export const join=(a,b)=>{const out=new Uint8Array(a.length+b.length);out.set(a);out.set(b,a.length);return out;};
export async function inflate(bytes,expected){
  if(expected>64*1024*1024)throw Error('单个压缩数据块超过 64 MB，请先在源工具中重新分块保存');
  if(typeof DecompressionStream==='undefined')throw Error('当前浏览器不支持解压缩，请升级 Safari/Chrome');
  const stream=new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate'));
  const reader=stream.getReader(),parts=[];let length=0;
  try{while(true){const {value,done}=await reader.read();if(done)break;length+=value.length;
    if(length>expected)throw Error('解压后长度超出文件声明，文件可能损坏');parts.push(value);}}
  finally{await reader.cancel();}
  if(length!==expected)throw Error('压缩数据块长度不一致');
  const out=new Uint8Array(length);let p=0;for(const part of parts){out.set(part,p);p+=part.length;}return out;
}
export class Parts {
  constructor(){this.parts=[];this.size=0;this.pending=[];this.pendingSize=0;}
  add(value){const bytes=typeof value==='string'?enc.encode(value):value;this.pending.push(bytes);this.pendingSize+=bytes.length;this.size+=bytes.length;
    if(this.size>1024*1024*1024)throw Error('输出超过 1 GB，建议拆分日志后转换');
    if(this.pendingSize>=1024*1024)this.flush();}
  flush(){if(this.pendingSize){this.parts.push(new Blob(this.pending));this.pending=[];this.pendingSize=0;}}
  blob(prefix=[]){this.flush();return new Blob([...prefix,...this.parts],{type:'application/octet-stream'});}
}
