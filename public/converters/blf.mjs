import {read,view,ascii,enc,join,inflate,frame,Parts} from './utils.mjs';

export async function* readBLF(blob,options={}){
  const header=await read(blob,0,76),h=view(header);
  if(ascii(header,0,4)!=='LOGG')throw Error('不是有效的 BLF 文件');
  let offset=h.getUint32(4,true),tail=new Uint8Array();
  if(offset<76||offset>blob.size)throw Error('BLF 文件头损坏');
  while(offset<blob.size){
    const base=await read(blob,offset,16),v=view(base),size=v.getUint32(8,true),type=v.getUint32(12,true);
    if(ascii(base,0,4)!=='LOBJ'||size<16||size>64*1024*1024)throw Error('BLF 对象头损坏或对象过大');
    const object=await read(blob,offset,size);offset+=size+size%4;
    if(type!==10){options.warn?.('已略过 BLF 非日志容器对象');continue;}
    if(size<32)throw Error('BLF 容器截断');
    const c=view(object),method=c.getUint16(16,true),length=c.getUint32(24,true);
    let bytes;
    if(method===0){bytes=object.subarray(32);if(bytes.length!==length)throw Error('BLF 容器长度不一致');}
    else if(method===2)bytes=await inflate(object.subarray(32),length);
    else throw Error('暂不支持该 BLF 压缩方式：'+method);
    bytes=join(tail,bytes);let p=0;
    while(p+16<=bytes.length){
      let skipped=0;while(skipped<8&&ascii(bytes,p,4)!=='LOBJ'&&p<bytes.length){p++;skipped++;}
      if(p+16>bytes.length)break;
      if(ascii(bytes,p,4)!=='LOBJ')throw Error('BLF 报文对象损坏');
      const d=view(bytes.subarray(p)),headerSize=d.getUint16(4,true),version=d.getUint16(6,true),objectSize=d.getUint32(8,true),kind=d.getUint32(12,true);
      if(objectSize<headerSize||headerSize<32||objectSize>64*1024*1024)throw Error('BLF 报文长度无效');
      if(p+objectSize>bytes.length)break;
      if(![1,2].includes(version))throw Error('不支持的 BLF 对象头版本：'+version);
      const time=Number(d.getBigUint64(24,true))*(d.getUint32(16,true)===1?1e-5:1e-9);
      const b=view(bytes.subarray(p+headerSize,p+objectSize));let f;
      if([1,86].includes(kind)){
        if(b.byteLength<16)throw Error('BLF CAN 帧截断');
        const flags=b.getUint8(2),id=b.getUint32(4,true),dlc=b.getUint8(3),remote=!!(flags&128);
        f={time,id:id&0x1fffffff,extended:!!(id&0x80000000),channel:b.getUint16(0,true),rx:!(flags&1),remote,dlc,data:bytes.slice(p+headerSize+8,p+headerSize+8+(remote?0:dlc))};
      }else if(kind===100){
        if(b.byteLength<84)throw Error('BLF CAN FD 帧截断');
        const flags=b.getUint8(2),fdFlags=b.getUint8(13),id=b.getUint32(4,true),length=b.getUint8(14);
        f={time,id:id&0x1fffffff,extended:!!(id&0x80000000),channel:b.getUint16(0,true),rx:!(flags&1),remote:!!(flags&128),dlc:b.getUint8(3),fd:!!(fdFlags&1),brs:!!(fdFlags&2),esi:!!(fdFlags&4),data:bytes.slice(p+headerSize+20,p+headerSize+20+length)};
      }else if(kind===101){
        if(b.byteLength<40)throw Error('BLF CAN FD 64 帧截断');
        const id=b.getUint32(4,true),flags=b.getUint32(12,true),length=b.getUint8(2);
        if(b.byteLength<40+length)throw Error('BLF CAN FD 数据不足');
        f={time,id:id&0x1fffffff,extended:!!(id&0x80000000),channel:b.getUint8(0),rx:!b.getUint8(34),remote:!!(flags&16),dlc:b.getUint8(1),fd:!!(flags&4096),brs:!!(flags&8192),esi:!!(flags&16384),data:bytes.slice(p+headerSize+40,p+headerSize+40+length)};
      }else if([2,73].includes(kind))throw Error('BLF 包含错误帧，本次转换仅支持数据帧和远程帧');
      else options.warn?.('已略过 BLF 非 CAN 数据/远程帧对象');
      if(f)yield frame(f);p+=objectSize;
    }
    tail=bytes.slice(p);options.progress?.(offset/blob.size);
  }
  if(tail.some(b=>b!==0))throw Error('BLF 尾部报文截断');
}

export function blfWriter(){
  const output=new Parts();let pending=[],length=0,count=0;
  function flush(){
    if(!length)return;
    const bytes=new Uint8Array(32+length),d=view(bytes);bytes.set(enc.encode('LOBJ'));d.setUint16(4,16,true);d.setUint16(6,1,true);d.setUint32(8,bytes.length,true);d.setUint32(12,10,true);d.setUint32(24,length,true);
    let p=32;for(const b of pending){bytes.set(b,p);p+=b.length;}output.add(bytes);pending=[];length=0;
  }
  return {add(f){
    const bytes=new Uint8Array(f.fd?116:48),d=view(bytes);bytes.set(enc.encode('LOBJ'));d.setUint16(4,32,true);d.setUint16(6,1,true);d.setUint32(8,bytes.length,true);d.setUint32(12,f.fd?100:1,true);d.setUint32(16,2,true);d.setBigUint64(24,BigInt(Math.round(f.time*1e9)),true);
    d.setUint16(32,f.channel,true);d.setUint8(34,(f.rx?0:1)|(f.remote?128:0));d.setUint8(35,f.dlc);d.setUint32(36,(f.id|(f.extended?0x80000000:0))>>>0,true);
    if(f.fd){d.setUint8(45,1|(f.brs?2:0)|(f.esi?4:0));d.setUint8(46,f.data.length);bytes.set(f.data,52);}else bytes.set(f.data,40);
    pending.push(bytes);length+=bytes.length;count++;if(length>=128*1024)flush();
  },finish(){
    flush();const header=new Uint8Array(144),d=view(header);header.set(enc.encode('LOGG'));d.setUint32(4,144,true);header.set([5,0,0,0,2,6,8,1],8);d.setBigUint64(16,BigInt(144+output.size),true);d.setBigUint64(24,BigInt(144+output.size),true);d.setUint32(32,count,true);return output.blob([header]);
  }};
}
