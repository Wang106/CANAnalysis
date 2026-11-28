import {decodePhysical, rawBits, signalFitsDlc} from '../can/codec.mjs';
import {parseDbcFloatTypeLine, parseDbcMessageLine, parseDbcSignalLine} from '../can/dbc-text.mjs';

const messageKey=(id,extended)=>id+'_'+(extended?'x':'s');

export {signalFitsDlc};

export function parseDBC(text){
  const messages=new Map(),signals=[],floatTypes=new Map();let current=null;
  for(const sourceLine of text.split(/\r?\n/)){
    const line=sourceLine.trim();
    if(line.startsWith('BO_ ')){
      const message=parseDbcMessageLine(line);
      if(!message){current=null;continue;}
      if(!Number.isSafeInteger(message.encoded))throw Error('DBC 报文 ID 超出安全范围');
      const key=messageKey(message.id,message.extended);
      current={key,id:message.id,extended:message.extended,name:message.name,dlc:message.dlc,sender:message.sender,signals:[],multiplexer:null};messages.set(key,current);
    }else if(line.startsWith('SG_ ')&&current){
      const parsed=parseDbcSignalLine(line);
      if(!parsed)continue;
      const signal={key:current.key+'::'+parsed.name,name:parsed.name,messageKey:current.key,messageId:current.id,messageExtended:current.extended,messageName:current.name,
        mux:parsed.mux,isMultiplexer:parsed.isMultiplexer,muxValue:parsed.muxValue,
        startBit:parsed.startBit,length:parsed.length,byteOrder:parsed.byteOrder,isSigned:parsed.isSigned,factor:parsed.factor,offset:parsed.offset,min:parsed.min,max:parsed.max,unit:parsed.unit,floatType:0};
      if(!Number.isFinite(signal.factor))signal.factor=1;if(!Number.isFinite(signal.offset))signal.offset=0;
      current.signals.push(signal);signals.push(signal);if(signal.isMultiplexer&&!current.multiplexer)current.multiplexer=signal;
    }else if(line.startsWith('SIG_VALTYPE_ ')){
      const parsed=parseDbcFloatTypeLine(line);
      if(parsed)floatTypes.set(messageKey(parsed.id,parsed.extended)+'::'+parsed.name,parsed.floatType);
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

export function decodeSignal(data,signal){
  return decodePhysical(data,signal);
}

export function signalActive(data,signal){
  if(signal.muxValue===null||signal.muxValue===undefined)return true;
  if(!signal.multiplexer||!signalFitsDlc(signal.multiplexer,data.length))return false;
  return Number(rawBits(data,signal.multiplexer))===signal.muxValue;
}
