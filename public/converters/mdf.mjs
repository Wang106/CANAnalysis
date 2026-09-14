import {read,view,ascii,enc,inflate,join,frame,DLC_LENGTHS,Parts} from './utils.mjs';

const safe64=(v,p)=>{const n=Number(v.getBigUint64(p,true));if(!Number.isSafeInteger(n))throw Error('MDF 地址或计数超出安全范围');return n;};
const set64=(v,p,n)=>v.setBigUint64(p,BigInt(n),true);
const visited=(set,address)=>{if(set.has(address)||set.size>100000)throw Error('MDF 块链接循环或数量过多');set.add(address);};
async function block4(blob,address){
  const head=await read(blob,address,24),d=view(head),size=safe64(d,8),n=safe64(d,16);
  if(n>100000||size<24+n*8||address+size>blob.size)throw Error('MDF4 块长度或链接损坏');
  const prefix=await read(blob,address,Math.min(size,24+n*8+160)),v=view(prefix),links=[];
  for(let i=0;i<n;i++)links.push(safe64(v,24+i*8));
  return {address,id:ascii(head,0,4),size,links,p:24+n*8,v};
}
async function text4(blob,address){if(!address)return '';const b=await block4(blob,address);if(!['##TX','##MD'].includes(b.id)||b.size>65536)throw Error('MDF 文本块无效');return ascii(await read(blob,address+24,b.size-24)).trim();}
async function linear4(blob,address){
  if(!address)return [0,1];const c=await block4(blob,address),type=c.v.getUint8(c.p);
  if(type===0)return [0,1];if(type!==1)throw Error('暂不支持此 MDF 时间轴换算类型');
  return [c.v.getFloat64(c.p+24,true),c.v.getFloat64(c.p+32,true)];
}
async function channels4(blob,address,out=[],seen=new Set()){
  while(address){visited(seen,address);const c=await block4(blob,address);if(c.id!=='##CN')throw Error('MDF 通道块无效');
    const name=await text4(blob,c.links[2]),p=c.p,v=c.v;
    out.push({name,type:v.getUint8(p),dtype:v.getUint8(p+2),bit:v.getUint8(p+3),offset:v.getUint32(p+4,true),bits:v.getUint32(p+8,true),flags:v.getUint32(p+12,true),invalid:v.getUint32(p+16,true),conversion:c.links[4]});
    if(c.links[1]){const child=await block4(blob,c.links[1]);if(child.id==='##CN')await channels4(blob,c.links[1],out,seen);}
    address=c.links[0];
  }return out;
}
async function* data4(blob,address,path=new Set()){
  if(!address)return;visited(path,address);if(path.size>128)throw Error('MDF 数据链接层级过深');
  const b=await block4(blob,address);
  if(b.id==='##DT'){
    for(let offset=24;offset<b.size;offset+=1024*1024)yield await read(blob,address+offset,Math.min(1024*1024,b.size-offset));
  }else if(b.id==='##DZ'){
    const zipType=b.v.getUint8(26),parameter=b.v.getUint32(28,true),original=safe64(b.v,32),compressed=safe64(b.v,40);
    if(ascii(new Uint8Array(b.v.buffer,b.v.byteOffset,b.v.byteLength),24,2)!=='DT')throw Error('暂不支持 MDF4 分离信号数据块');
    if(![0,1].includes(zipType))throw Error('MF4 使用了 ZSTD/LZ4 等压缩，请在 asammdf 中另存为 Deflate 或不压缩');
    if(48+compressed>b.size)throw Error('MF4 压缩数据截断');
    const bytes=await inflate(await read(blob,address+48,compressed),original);
    if(zipType===1){
      if(!parameter)throw Error('MF4 转置参数为零');const rows=Math.floor(original/parameter),out=new Uint8Array(original);
      for(let i=0;i<rows;i++)for(let j=0;j<parameter;j++)out[i*parameter+j]=bytes[j*rows+i];out.set(bytes.subarray(rows*parameter),rows*parameter);yield out;
    }else yield bytes;
  }else if(b.id==='##HL')yield* data4(blob,b.links[0],new Set(path));
  else if(b.id==='##DL'){
    const seen=new Set();let current=b;
    while(current){visited(seen,current.address);
      for(const link of current.links.slice(1))yield* data4(blob,link,new Set(path));
      current=current.links[0]?await block4(blob,current.links[0]):null;
      if(current&&current.id!=='##DL')throw Error('MDF 数据列表损坏');
    }
  }else throw Error('暂不支持的 MDF4 数据布局：'+b.id+'，请另存为 MDF 4.10');
}
function scalar(record,c,version){
  if(!c)return undefined;const n=Math.ceil((c.bits+c.bit)/8),offset=c.offset,d=view(record);
  if(offset+n>record.length||n>8)throw Error('MDF 数值通道长度无效');
  const little=version===4?![1,3,5].includes(c.dtype):![9,10,11,12].includes(c.dtype);
  const float=version===4?[4,5].includes(c.dtype):[2,3,11,12,15,16].includes(c.dtype);
  if(float){if(c.bit||![32,64].includes(c.bits))throw Error('MDF 浮点通道格式无效');return c.bits===64?d.getFloat64(offset,little):d.getFloat32(offset,little);}
  let value=0n;
  if(little){for(let i=n-1;i>=0;i--)value=value*256n+BigInt(record[offset+i]);value>>=BigInt(c.bit);}
  else {for(let i=0;i<n;i++)value=value*256n+BigInt(record[offset+i]);value>>=BigInt(n*8-c.bits-c.bit);}
  value&=(1n<<BigInt(c.bits))-1n;
  const signed=version===4?[2,3].includes(c.dtype):[1,10,14].includes(c.dtype);
  if(signed&&(value&(1n<<BigInt(c.bits-1))))value-=1n<<BigInt(c.bits);
  return Number(value);
}
function mapChannels(channels,version){
  const master=channels.find(c=>c.type===(version===4?2:1));
  const id=channels.find(c=>/CAN_(Data|Remote|Error)Frame\.ID$/.test(c.name));
  if(!id)return null;
  if(!master)throw Error('MDF 原始 CAN 帧没有可用时间轴');
  const prefix=id.name.slice(0,-3),fields={master};
  for(const c of channels)if(c.name.startsWith(prefix+'.'))fields[c.name.slice(prefix.length+1)]=c;
  if(prefix.includes('Error'))throw Error('MDF 包含 CAN 错误帧，本次转换不支持');
  return {fields,remote:prefix.includes('Remote')};
}
function decodeRecord(record,group,version){
  const {fields,remote}=group.mapping,get=key=>scalar(record,fields[key],version);
  for(const c of Object.values(fields))if(version===4){
    if(c.flags&1)throw Error('MDF 包含标记为无效的 CAN 帧');
    if(c.flags&2){const p=group.sampleBytes+(c.invalid>>3);if(p>=record.length)throw Error('MDF 无效位越界');if(record[p]&(1<<(c.invalid%8)))throw Error('MDF 包含无效样本，转换已停止');}
  }
  const time=get('master')*group.linear[1]+group.linear[0],rawId=get('ID'),fd=!!get('EDL');
  const dlc=get('DLC')??(fd?DLC_LENGTHS.indexOf(get('DataLength')):get('DataLength'));
  const length=remote?0:(get('DataLength')??(fd?DLC_LENGTHS[dlc]:dlc));
  const field=fields.DataBytes;
  if(!remote&&(!field||field.bit||length>field.bits/8||field.offset+length>record.length))throw Error('MDF 缺少完整的 CAN_DataFrame.DataBytes 原始数据');
  return frame({time,id:rawId&0x1fffffff,extended:fields.IDE?!!get('IDE'):!!(rawId&0x80000000)||rawId>0x7ff,channel:(get('BusChannel')??0)+1,rx:!get('Dir'),remote,fd,brs:!!get('BRS'),esi:!!get('ESI'),dlc,data:remote?new Uint8Array():record.slice(field.offset,field.offset+length)});
}
async function* records(chunks,group,allGroups,idLength,version){
  let tail=new Uint8Array(),count=0,last=-Infinity;
  for await(const chunk of chunks){
    const bytes=join(tail,chunk);let p=0;
    while(p+idLength<bytes.length){
      let target=group;
      if(idLength){let id=0;for(let i=0;i<(version===3?1:idLength);i++)id+=bytes[p+i]*2**(8*i);target=allGroups.find(g=>g.recordId===id);if(!target)throw Error('MDF 未知记录 ID');}
      const size=target.sampleBytes+target.invalidBytes;
      if(!size||size>1024*1024)throw Error('MDF 记录大小异常');
      const trailing=version===3&&idLength===2?1:0,leading=version===3&&idLength===2?1:idLength;
      if(p+leading+size+trailing>bytes.length)break;
      if(target===group){const f=decodeRecord(bytes.subarray(p+leading,p+leading+size),group,version);if(f.time<last)throw Error('MDF 组内时间轴不是递增顺序，请在 asammdf 中排序后另存');last=f.time;count++;yield f;}
      p+=leading+size+trailing;
    }tail=bytes.slice(p);
  }
  if(tail.length||count!==group.cycles)throw Error('MDF 记录数量不匹配或数据截断');
}
async function groups4(blob,options){
  const header=await block4(blob,64);if(header.id!=='##HD')throw Error('MDF4 文件头损坏');
  let address=header.links[0];const groups=[],seen=new Set();
  while(address){visited(seen,address);const dg=await block4(blob,address);if(dg.id!=='##DG')throw Error('MDF4 数据组无效');
    const idLength=dg.v.getUint8(dg.p);if(![0,1,2,4,8].includes(idLength))throw Error('不支持 MDF 记录 ID 宽度');
    let cgAddress=dg.links[1];const dgGroups=[],cgSeen=new Set();
    while(cgAddress){visited(cgSeen,cgAddress);const cg=await block4(blob,cgAddress),v=cg.v,p=cg.p;
      if(cg.id!=='##CG')throw Error('MDF 通道组无效');
      const cycles=safe64(v,p+8),flags=v.getUint16(p+16,true);
      if(flags&9)throw Error('暂不支持可变长或远程主通道 MDF 数据组');
      const channels=await channels4(blob,cg.links[1]);
      const mapping=cycles?mapChannels(channels,4):null;
      const group={cycles,recordId:safe64(v,p),sampleBytes:v.getUint32(p+24,true),invalidBytes:v.getUint32(p+28,true),mapping};
      if(mapping)group.linear=await linear4(blob,mapping.fields.master.conversion);
      else if(cycles)options.warn?.('已略过 MDF 非原始 CAN 信号组');
      dgGroups.push(group);cgAddress=cg.links[0];
    }
    for(const group of dgGroups)if(group.mapping)groups.push(records(data4(blob,dg.links[2]),group,dgGroups,idLength,4));
    address=dg.links[0];
  }return groups;
}
async function block3(blob,address){const h=await read(blob,address,4),size=view(h).getUint16(2,true);if(size<4||size>65535)throw Error('MDF3 块损坏');return {id:ascii(h,0,2),v:view(await read(blob,address,size)),size};}
async function groups3(blob,options){
  const header=await block3(blob,64);let address=header.v.getUint32(4,true);const groups=[],seen=new Set();
  while(address){visited(seen,address);const dg=await block3(blob,address),d=dg.v;let ca=d.getUint32(8,true);const idLength=d.getUint16(22,true),dgGroups=[],cgSeen=new Set();
    if(idLength>2)throw Error('MDF3 记录 ID 格式不支持');
    while(ca){visited(cgSeen,ca);const cg=await block3(blob,ca),v=cg.v,channels=[],cnSeen=new Set();let cn=v.getUint32(8,true);
      while(cn){visited(cnSeen,cn);const c=await block3(blob,cn),cv=c.v,b=new Uint8Array(cv.buffer);if(c.id!=='CN'||c.size<218)throw Error('MDF3 通道块损坏');
        let name=ascii(b,26,32);if(c.size>=222&&cv.getUint32(218,true)){const tx=await block3(blob,cv.getUint32(218,true));name=ascii(new Uint8Array(tx.v.buffer),4);}
        const bits=cv.getUint16(186,true),extra=c.size>=228?cv.getUint16(226,true):0;
        channels.push({name,type:cv.getUint16(24,true),dtype:cv.getUint16(190,true),offset:(bits>>3)+extra,bit:bits%8,bits:cv.getUint16(188,true),conversion:cv.getUint32(8,true)});cn=cv.getUint32(4,true);
      }
      const cycles=v.getUint32(22,true),mapping=cycles?mapChannels(channels,3):null;let linear=[0,1];
      if(mapping?.fields.master.conversion){const c=await block3(blob,mapping.fields.master.conversion),type=c.v.getUint16(42,true);if(type===0)linear=[c.v.getFloat64(46,true),c.v.getFloat64(54,true)];else if(type!==65535)throw Error('MDF3 时间轴换算不支持');}
      dgGroups.push({mapping,linear,cycles,recordId:v.getUint16(16,true),sampleBytes:v.getUint16(20,true),invalidBytes:0});ca=v.getUint32(4,true);
    }
    const total=dgGroups.reduce((sum,g)=>sum+g.cycles*(g.sampleBytes+idLength),0),dataAddress=d.getUint32(16,true);
    async function* chunks(){for(let offset=0;offset<total;offset+=1024*1024)yield await read(blob,dataAddress+offset,Math.min(total-offset,1024*1024));}
    for(const g of dgGroups)if(g.mapping)groups.push(records(chunks(),g,dgGroups,idLength,3));
    address=d.getUint32(4,true);
  }return groups;
}
export async function* readMDF(blob,options={}){
  const id=await read(blob,0,64);if(ascii(id,0,8).trim()!=='MDF')throw Error('不是有效 MDF/MF4 文件');
  const version=view(id).getUint16(28,true);
  if(version<300||version>=420)throw Error('支持 MDF 3.x 和 MDF 4.00–4.11，请在 asammdf 中另存为对应版本');
  if(version<400&&(view(id).getUint16(24,true)||view(id).getUint16(26,true)))throw Error('暂不支持默认大端或非 IEEE 浮点 MDF3 文件，请另存为小端 IEEE 格式');
  if(version>=400&&(view(id).getUint16(60,true)||view(id).getUint16(62,true)))throw Error('MDF 文件尚未完成记录，请先在源工具中完成或修复文件');
  const iterators=version>=400?await groups4(blob,options):await groups3(blob,options);
  if(!iterators.length)throw Error('MDF 中没有原始 CAN 帧；只有解码信号的文件无法还原报文');
  const next=await Promise.all(iterators.map(it=>it.next()));
  while(true){let selected=-1;for(let i=0;i<next.length;i++)if(!next[i].done&&(selected<0||next[i].value.time<next[selected].value.time))selected=i;
    if(selected<0)break;yield next[selected].value;next[selected]=await iterators[selected].next();
  }
}

// A minimal standards-shaped MDF3/4 writer: raw bus records, linear time, no compression.
export function mdfWriter(version){
  const groups=[{name:'CAN_DataFrame',size:84,parts:new Parts(),count:0},{name:'CAN_RemoteFrame',size:17,parts:new Parts(),count:0}];
  return {add(f){
    if(version===3&&f.fd)throw Error('MDF 3.30 输出仅支持经典 CAN；CAN FD 请选 MF4');
    if(f.channel>256)throw Error('MDF CAN BusChannel 不能超过 256');
    const g=groups[f.remote?1:0],bytes=new Uint8Array(g.size),v=view(bytes);v.setFloat64(0,f.time,true);v.setUint8(8,f.channel-1);v.setUint32(9,f.id,true);v.setUint8(13,+f.extended);v.setUint8(14,f.dlc);v.setUint8(15,f.data.length);
    if(f.remote)v.setUint8(16,f.rx?0:1);else{bytes.set(f.data,16);bytes.set([f.rx?0:1,+f.fd,+f.brs,+f.esi],80);}g.parts.add(bytes);g.count++;
  },finish(){return writeMDF(groups.filter(g=>g.count),version);}};
}
function writeMDF(groups,version){
  const blocks=[];let position=64;
  function alloc(id,length,links=0){
    const bytes=new Uint8Array(length),v=view(bytes);bytes.set(enc.encode(id));
    if(version===4){set64(v,8,length);set64(v,16,links);}else v.setUint16(2,length,true);
    const block={bytes,v,address:position};blocks.push(block);position+=length;return block;
  }
  function text(value){const data=enc.encode(value+'\0'),size=version===4?Math.ceil((24+data.length)/8)*8:4+data.length;const b=alloc(version===4?'##TX':'TX',size);b.bytes.set(data,version===4?24:4);return b.address;}
  const header=alloc(version===4?'##HD':'HD',version===4?104:208,6);
  if(version===3){header.v.setUint16(16,groups.length,true);header.bytes.set(enc.encode('01:01:1970'),18);header.bytes.set(enc.encode('00:00:00'),28);}
  let previous=null;
  for(const g of groups){
    const dg=alloc(version===4?'##DG':'DG',version===4?64:28,4);g.dg=dg;
    if(previous){if(version===4)set64(previous.v,24,dg.address);else previous.v.setUint32(4,dg.address,true);}
    else if(version===4)set64(header.v,24,dg.address);else header.v.setUint32(4,dg.address,true);previous=dg;
    const cg=alloc(version===4?'##CG':'CG',version===4?104:30,6);
    if(version===4){set64(dg.v,32,cg.address);set64(cg.v,80,g.count);cg.v.setUint16(88,2,true);cg.v.setUint32(96,g.size,true);
      const source=alloc('##SI',56,3);source.bytes.set([2,2,0],48);set64(cg.v,40,text(g.name));set64(cg.v,48,source.address);
    }else{dg.v.setUint32(8,cg.address,true);dg.v.setUint16(20,1,true);cg.v.setUint16(20,g.size,true);cg.v.setUint32(22,g.count,true);}
    const fields=[['time',0,64,version===4?4:3],['BusChannel',8,8,0],['ID',9,32,0],['IDE',13,8,0],['DLC',14,8,0],['DataLength',15,8,0]];
    if(g.name==='CAN_DataFrame')fields.push(['DataBytes',16,512,version===4?10:8],['Dir',80,8,0],['EDL',81,8,0],['BRS',82,8,0],['ESI',83,8,0]);else fields.push(['Dir',16,8,0]);
    const channels=fields.map(([name,offset,bits,dtype],i)=>{
      const c=alloc(version===4?'##CN':'CN',version===4?160:228,8),fullName=i?g.name+'.'+name:'time';
      if(version===4){set64(c.v,40,text(fullName));c.bytes[88]=i?0:2;c.bytes[89]=i?0:1;c.bytes[90]=dtype;c.v.setUint32(92,offset,true);c.v.setUint32(96,bits,true);if(!i)set64(c.v,72,text('s'));}
      else{c.v.setUint16(24,i?0:1,true);c.bytes.set(enc.encode(fullName).subarray(0,31),26);c.v.setUint16(186,offset*8,true);c.v.setUint16(188,bits,true);c.v.setUint16(190,dtype,true);}
      return c;
    });
    if(version===4){
      const root=alloc('##CN',160,8);set64(root.v,32,channels[1].address);set64(root.v,40,text(g.name));root.bytes[90]=10;root.v.setUint32(92,8,true);root.v.setUint32(96,(g.size-8)*8,true);root.v.setUint32(100,1024,true);
      set64(cg.v,32,channels[0].address);set64(channels[0].v,24,root.address);
      for(let i=1;i<channels.length-1;i++)set64(channels[i].v,24,channels[i+1].address);
    }else{cg.v.setUint32(8,channels[0].address,true);cg.v.setUint16(18,channels.length,true);for(let i=0;i<channels.length-1;i++)channels[i].v.setUint32(4,channels[i+1].address,true);}
  }
  const id=new Uint8Array(64);id.set(enc.encode('MDF     '+(version===4?'4.10    ':'3.30    ')+'CANAnaly'));view(id).setUint16(28,version===4?410:330,true);
  const output=[id,...blocks.map(b=>b.bytes)];
  for(const g of groups){
    if(version===4){set64(g.dg.v,40,position);const dt=new Uint8Array(24);dt.set(enc.encode('##DT'));set64(view(dt),8,24+g.parts.size);output.push(dt);position+=24;}
    else g.dg.v.setUint32(16,position,true);
    output.push(g.parts.blob());position+=g.parts.size;
    if(version===4&&position%8){const pad=8-position%8;output.push(new Uint8Array(pad));position+=pad;}
  }
  return new Blob(output,{type:'application/octet-stream'});
}
