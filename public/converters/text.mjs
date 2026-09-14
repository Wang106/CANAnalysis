import {frame,uint,hex,bytesFrom,DLC_LENGTHS,Parts,read} from './utils.mjs';

async function* lines(blob,options){
  const bom=await read(blob,0,Math.min(4,blob.size));
  const encoding=bom[0]===255&&bom[1]===254?'utf-16le':bom[0]===254&&bom[1]===255?'utf-16be':options.encoding||'utf-8';
  const decoder=new TextDecoder(encoding,{fatal:true});let tail='',number=0;
  for(let offset=0;offset<blob.size;offset+=1024*1024){
    tail+=decoder.decode(await read(blob,offset,Math.min(1024*1024,blob.size-offset)),{stream:true});
    const rows=tail.split(/\r?\n/);tail=rows.pop();
    if(tail.length>1024*1024)throw Error('文本行过长，请检查输入格式');
    for(const line of rows)yield {line:line.trim().replace(/^\uFEFF/,''),number:++number};
    options.progress?.(Math.min(1,(offset+1024*1024)/blob.size));
  }
  tail+=decoder.decode();if(tail.trim())yield {line:tail.trim(),number:++number};
}
function clock(token){
  const m=token.match(/^(\d+):(\d{2}):(\d{2})[:.](\d+)$/);
  if(!m)throw Error('无效时间：'+token);
  if(+m[2]>59||+m[3]>59)throw Error('无效时分秒');
  return +m[1]*3600 + +m[2]*60 + +m[3] + Number('0.'+m[4]);
}
export async function* readText(blob,format,options={}){
  let base=16,relative=false,lastTime=0,trcVersion='1.0',columns=null,txtColumns=null;
  let dayOffset=0,previousClock=0;
  for await(const {line,number} of lines(blob,options)){
    if(!line)continue;
    try{
      if(format==='asc'){
        if(/^base /i.test(line)){base=/base dec/i.test(line)?10:16;relative=/timestamps relative/i.test(line);continue;}
        if(/^\d+(?:\.\d+)?\s+\d+\s+ErrorFrame/i.test(line)||/\bCANFD\s+\d+\s+\w+\s+ErrorFrame/i.test(line))throw Error('包含错误帧，本次转换仅支持数据帧和远程帧');
        const tokens=line.split(/\s+/);if(!/^\d+(?:\.\d+)?$/.test(tokens[0]))continue;
        if(!/^\d+$/.test(tokens[1])&&tokens[1]!=='CANFD'){options.warn?.('已略过 ASC 非 CAN 事件');continue;}
        let t=Number(tokens[0]);if(relative){t+=lastTime;lastTime=t;}
        if(tokens[1]==='CANFD'){
          if(!['Rx','Tx'].includes(tokens[3]))throw Error('ASC CAN FD 收发方向无效');
          let k=5;if(!/^[01]$/.test(tokens[k]))k++;
          const idText=tokens[4],extended=/x$/i.test(idText),dlc=uint(tokens[k+2],base),length=uint(tokens[k+3]);
          yield frame({time:t,channel:uint(tokens[2]),rx:tokens[3]==='Rx',id:uint(idText.replace(/x$/i,''),base),extended,fd:true,brs:tokens[k]==='1',esi:tokens[k+1]==='1',dlc,data:bytesFrom(tokens.slice(k+4),length)});
        }else{
          if(!['Rx','Tx'].includes(tokens[3])||!['d','r'].includes(tokens[4]))throw Error('不支持的 ASC CAN 行格式');
          const idText=tokens[2],extended=/x$/i.test(idText),remote=tokens[4]==='r',dlc=uint(tokens[5]||'0');
          const data=base===16?bytesFrom(tokens.slice(6),remote?0:dlc):Uint8Array.from(tokens.slice(6,6+dlc),t=>{const n=uint(t);if(n>255)throw Error('数据字节超范围');return n;});
          yield frame({time:t,channel:uint(tokens[1]),id:uint(idText.replace(/x$/i,''),base),extended,rx:tokens[3]==='Rx',remote,dlc,data});
        }
      }else if(format==='log'){
        if(line.startsWith('***')){if(/^\*+DEC/i.test(line))base=10;if(/^\*+HEX/i.test(line))base=16;if(/RELATIVE MODE/i.test(line))throw Error('BusMaster 相对时间模式暂不支持，请在源工具中导出 ABSOLUTE MODE');continue;}
        if(!/^\d+:/.test(line))continue;
        const p=line.split(/\s+/);if(p.length<6)throw Error('BusMaster 报文列不完整');
        if(!['Rx','Tx'].includes(p[1]))throw Error('BusMaster 收发方向无效');
        const stamp=clock(p[0]);if(stamp<previousClock&&previousClock-stamp>43200)dayOffset+=86400;previousClock=stamp;
        const kind=p[4].toUpperCase();if(!['S','X','SR','XR'].includes(kind))throw Error('不支持的 BusMaster 帧类型：'+kind);
        const remote=kind.includes('R'),dlc=uint(p[5]);
        yield frame({time:stamp+dayOffset,rx:p[1]==='Rx',channel:uint(p[2]),id:uint(p[3],base),extended:kind.startsWith('X'),remote,dlc,data:base===16?bytesFrom(p.slice(6),remote?0:dlc):Uint8Array.from(p.slice(6),t=>{const n=uint(t);if(n>255)throw Error('数据字节超范围');return n;})});
      }else if(format==='trc'){
        if(line.startsWith(';')){if(line.startsWith(';$FILEVERSION='))trcVersion=line.split('=')[1];if(line.startsWith(';$COLUMNS='))columns=line.split('=')[1].split(',');continue;}
        const p=line.split(/\s+/);if(!/^\d+\)?$/.test(p[0]))continue;
        let time=Number(p[1])/1000,idText,channel=1,rx=true,remote=false,fd=false,brs=false,esi=false,dlc,data;
        if(trcVersion.startsWith('2.')){
          if(!columns||columns.at(-1)!=='D')throw Error('TRC 2.x 需要有效 COLUMNS，数据列 D 必须在最后');
          const get=k=>p[columns.indexOf(k)],kind=get('T');
          if(!['Rx','Tx'].includes(get('d')))throw Error('TRC 收发方向无效');
          if(!['DT','RR','FD','FB','FE','BI'].includes(kind))throw Error('TRC 包含不支持的事件类型：'+kind);
          time=Number(get('O'))/1000;idText=get('I');channel=columns.includes('B')?uint(get('B')):1;rx=get('d')==='Rx';remote=kind==='RR';fd=['FD','FB','FE','BI'].includes(kind);brs=['FB','BI'].includes(kind);esi=['FE','BI'].includes(kind);
          dlc=columns.includes('l')?(fd?DLC_LENGTHS.indexOf(uint(get('l'))):uint(get('l'))):uint(get('L'));
          data=bytesFrom(p.slice(columns.indexOf('D')),remote?0:fd?DLC_LENGTHS[dlc]:dlc);
        }else if(['1.0','1.1','1.3'].includes(trcVersion)){
          const idIndex=trcVersion==='1.0'?2:trcVersion==='1.1'?3:4;
          idText=p[idIndex];if(idText==='FFFFFFFF')throw Error('TRC 包含状态或错误帧');
          if(trcVersion!=='1.0'){if(!['Rx','Tx'].includes(p[idIndex-1]))throw Error('TRC 包含状态或错误帧');rx=p[idIndex-1]==='Rx';}if(trcVersion==='1.3')channel=uint(p[2]);
          const lenIndex=trcVersion==='1.3'?6:idIndex+1;dlc=uint(p[lenIndex]);remote=p[lenIndex+1]==='RTR';data=bytesFrom(p.slice(lenIndex+1),remote?0:dlc);
        }else throw Error('不支持的 TRC 版本：'+trcVersion);
        yield frame({time,id:uint(idText,16),extended:idText.length>4,channel,rx,remote,fd,brs,esi,dlc,data});
      }else if(format==='txt'){
        if(line.startsWith('#'))continue;
        // CANTest/ZCAN tabular exports; column names are used rather than fixed positions.
        if(/帧ID|\bID\b/i.test(line)&&/数据|Data/i.test(line)&&/时间|Time/i.test(line)){
          txtColumns=line.split(/\t+|\s*,\s*|\s+/);continue;
        }
        if(!txtColumns)throw Error('TXT 缺少表头，请使用包含时间、ID、数据长度、数据的 CANTest/ZCAN 导出表格');
        const p=line.includes('\t')?line.split('\t').map(s=>s.trim()):line.split(/\s*,\s*|\s+/);
        const index=re=>txtColumns.findIndex(s=>re.test(s));
        const ti=index(/^(时间\(s\)|时间标识|时间戳|Time\(s\)|Timestamp|Time)$/i),ii=index(/^(帧ID|ID|ID\(hex\))$/i),li=index(/^(数据长度|长度|DLC|Length)$/i),di=index(/^(数据|数据\(hex\)|Data)$/i);
        if([ti,ii,li,di].some(i=>i<0)||di!==txtColumns.length-1)throw Error('TXT 表头不匹配；数据列需位于最后');
        const rawTime=p[ti];const unit=options.txtTimeUnit||(/时间标识/.test(txtColumns[ti])?'0.0001':'1');
        const time=rawTime.includes(':')?clock(rawTime):(/^(?:0x|[\da-f]*[a-f])/i.test(rawTime)?uint(rawTime,16):Number(rawTime))*Number(unit);
        const ci=index(/^(CAN通道|通道|Channel)$/i),ri=index(/^(传输方向|方向|Direction|收发)$/i),fi=index(/^(帧格式|Format)$/i),ki=index(/^(帧类型|Type)$/i);
        const id=uint(p[ii],16),remote=ki>=0?/远程|Remote|RTR/i.test(p[ki]):false,dlc=uint(p[li]);
        yield frame({time,id,extended:fi>=0?/扩展|Extended|EXT/i.test(p[fi]):id>0x7ff,channel:ci>=0?uint(p[ci]):1,rx:ri<0||/接收|Rx/i.test(p[ri]),remote,dlc,data:bytesFrom(p.slice(di).join(' ').split(/\s+/),remote?0:dlc)});
      }
    }catch(error){throw Error('第 '+number+' 行：'+error.message);}
  }
}

export function textWriter(format){
  const output=new Parts();let count=0;
  const date='Thu Jan 01 00:00:00.000 1970';
  if(format==='asc')output.add('date '+date+'\nbase hex timestamps absolute\nno internal events logged\nBegin Triggerblock '+date+'\n');
  if(format==='trc')output.add(';$FILEVERSION=2.1\n;$STARTTIME=25569\n;$COLUMNS=N,O,T,B,I,d,R,L,D\n; CANAnalysis CAN conversion\n');
  if(format==='log')output.add('***BUSMASTER Ver 3.2.2***\n***PROTOCOL CAN***\n***NOTE: PLEASE DO NOT EDIT THIS DOCUMENT***\n***[START LOGGING SESSION]***\n***START DATE AND TIME 01:01:1970 00:00:00:000***\n***HEX***\n***ABSOLUTE MODE***\n***START CHANNEL BAUD RATE***\n***END CHANNEL BAUD RATE***\n');
  if(format==='txt')output.add('\uFEFF序号\t时间(s)\tCAN通道\t传输方向\tID\t帧类型\t帧格式\t数据长度\t数据\n');
  return {add(f){
    if(f.fd&&['log','txt'].includes(format))throw Error('此输出格式只支持经典 CAN，不能无损保存 CAN FD；请选择 ASC、TRC、BLF 或 MF4');
    const id=hex(f.id,f.extended?8:3),data=[...f.data].map(b=>hex(b)).join(' '),dir=f.rx?'Rx':'Tx';count++;
    if(format==='asc'){
      if(f.fd)output.add(`${f.time.toFixed(9)} CANFD ${f.channel} ${dir} ${id}${f.extended?'x':''} ${+f.brs} ${+f.esi} ${f.dlc.toString(16)} ${f.data.length} ${data} 0 0 0 0 0 0 0 0\n`);
      else output.add(`${f.time.toFixed(9)} ${f.channel} ${id}${f.extended?'x':''} ${dir} ${f.remote?'r':'d'} ${f.dlc} ${data}\n`);
    }else if(format==='trc'){
      const type=f.remote?'RR':f.fd?(f.brs?(f.esi?'BI':'FB'):(f.esi?'FE':'FD')):'DT';
      output.add(`${count} ${(f.time*1000).toFixed(3)} ${type} ${f.channel} ${hex(f.id,f.extended?8:4)} ${dir} - ${f.dlc} ${data}\r\n`);
    }else if(format==='log'){
      const ticks=Math.round(f.time*1e4),seconds=Math.floor(ticks/1e4);
      const time=[Math.floor(seconds/3600),Math.floor(seconds/60)%60,seconds%60].map(n=>String(n).padStart(2,'0')).join(':')+':'+String(ticks%1e4).padStart(4,'0');
      output.add(`${time} ${dir} ${f.channel} 0x${id} ${f.extended?'x':'s'}${f.remote?'r':''} ${f.dlc} ${data}\r\n`);
    }else output.add(`${count}\t${f.time.toFixed(9)}\t${f.channel}\t${f.rx?'接收':'发送'}\t0x${id}\t${f.remote?'远程帧':'数据帧'}\t${f.extended?'扩展帧':'标准帧'}\t${f.dlc}\t${data}\n`);
  },finish(){if(format==='asc')output.add('End TriggerBlock\n');if(format==='log')output.add('***[STOP LOGGING SESSION]***\n');return output.blob();}};
}
