const messageKey=(id,extended)=>id+'_'+(extended?'x':'s');

export function parseDBC(text){
  const messages=new Map(),signals=[],floatTypes=new Map();let current=null;
  for(const sourceLine of text.split(/\r?\n/)){
    const line=sourceLine.trim();
    if(line.startsWith('BO_ ')){
      const m=line.match(/^BO_\s+(\d+)\s+(\S+)\s*:\s*(\d+)\s+(\S+)/);
      if(!m){current=null;continue;}
      const encoded=Number(m[1]);if(!Number.isSafeInteger(encoded))throw Error('DBC 报文 ID 超出安全范围');
      const extended=(encoded&0x80000000)!==0,id=encoded&0x1fffffff,key=messageKey(id,extended);
      current={key,id,extended,name:m[2],dlc:Number(m[3]),sender:m[4],signals:[],multiplexer:null};messages.set(key,current);
    }else if(line.startsWith('SG_ ')&&current){
      const m=line.match(/^SG_\s+(\w+)\s*(?:(M|m\d+)\s*)?:\s*(\d+)\|(\d+)@(\d)([+-])\s*\(([^,]+),([^)]+)\)\s*\[([^|]+)\|([^\]]+)\]\s*"([^"]*)"\s*(.*)$/);
      if(!m)continue;
      const signal={key:current.key+'::'+m[1],name:m[1],messageKey:current.key,messageId:current.id,messageExtended:current.extended,messageName:current.name,
        mux:m[2]||null,isMultiplexer:m[2]==='M',muxValue:m[2]&&/^m\d+$/.test(m[2])?Number(m[2].slice(1)):null,
        startBit:Number(m[3]),length:Number(m[4]),byteOrder:Number(m[5]),isSigned:m[6]==='-',factor:Number(m[7]),offset:Number(m[8]),min:Number(m[9]),max:Number(m[10]),unit:m[11]||'',floatType:0};
      if(!Number.isFinite(signal.factor))signal.factor=1;if(!Number.isFinite(signal.offset))signal.offset=0;
      current.signals.push(signal);signals.push(signal);if(signal.isMultiplexer&&!current.multiplexer)current.multiplexer=signal;
    }else if(line.startsWith('SIG_VALTYPE_ ')){
      const m=line.match(/^SIG_VALTYPE_\s+(\d+)\s+(\w+)\s*:\s*([12])\s*;/);
      if(m){const encoded=Number(m[1]),extended=(encoded&0x80000000)!==0;floatTypes.set(messageKey(encoded&0x1fffffff,extended)+'::'+m[2],Number(m[3]));}
    }
  }
  for(const signal of signals){
    signal.floatType=floatTypes.get(signal.key)||0;
    signal.precisionUnsupported=signal.length>53&&!signal.floatType;
    if(signal.floatType&&signal.length!==(signal.floatType===1?32:64))throw Error('DBC 浮点信号 '+signal.name+' 的位长度无效');
    const message=messages.get(signal.messageKey);
    if(signal.muxValue!==null)signal.multiplexer=message?.multiplexer?pickSignal(message.multiplexer):null;
  }
  if(!messages.size||!signals.length)throw Error('DBC 中未找到可解析的报文和信号');
  return {messages,signals};
}

function pickSignal(signal){
  return {startBit:signal.startBit,length:signal.length,byteOrder:signal.byteOrder,isSigned:signal.isSigned,factor:signal.factor,offset:signal.offset,floatType:signal.floatType||0};
}

export function serializableSignal(signal){
  return {...pickSignal(signal),key:signal.key,name:signal.name,messageKey:signal.messageKey,messageId:signal.messageId,messageExtended:signal.messageExtended,messageName:signal.messageName,unit:signal.unit||'',muxValue:signal.muxValue,multiplexer:signal.multiplexer?{...signal.multiplexer}:null,precisionUnsupported:!!signal.precisionUnsupported};
}

export function signalFitsDlc(signal,dlc){
  if(!signal||!Number.isInteger(signal.startBit)||!Number.isInteger(signal.length)||signal.startBit<0||signal.length<=0||!Number.isInteger(dlc)||dlc<0)return false;
  let bit=signal.startBit;
  for(let i=0;i<signal.length;i++){
    if((bit>>>3)>=dlc)return false;
    if(signal.byteOrder===1)bit++;
    else if((bit&7)===0)bit+=15;
    else bit--;
  }
  return true;
}

function rawBits(data,signal){
  let value=0n,bit=signal.startBit;
  if(signal.byteOrder===1){
    for(let i=0;i<signal.length;i++,bit++)value|=BigInt((data[bit>>>3]>>>(bit&7))&1)<<BigInt(i);
  }else{
    for(let i=0;i<signal.length;i++){
      value=(value<<1n)|BigInt((data[bit>>>3]>>>(bit&7))&1);
      if((bit&7)===0)bit+=15;else bit--;
    }
  }
  return value;
}

export function decodeSignal(data,signal){
  if(!signalFitsDlc(signal,data.length))throw Error('信号 '+signal.name+' 的位定义超出实际报文长度');
  let raw=rawBits(data,signal);
  if(signal.floatType){
    const buffer=new ArrayBuffer(signal.floatType===1?4:8),view=new DataView(buffer);
    if(signal.floatType===1){view.setUint32(0,Number(raw),false);raw=view.getFloat32(0,false);}
    else{view.setBigUint64(0,raw,false);raw=view.getFloat64(0,false);}
    return raw*signal.factor+signal.offset;
  }
  if(signal.isSigned&&(raw&(1n<<BigInt(signal.length-1))))raw-=1n<<BigInt(signal.length);
  return Number(raw)*signal.factor+signal.offset;
}

export function signalActive(data,signal){
  if(signal.muxValue===null||signal.muxValue===undefined)return true;
  if(!signal.multiplexer||!signalFitsDlc(signal.multiplexer,data.length))return false;
  return Number(rawBits(data,signal.multiplexer))===signal.muxValue;
}
