import {convert} from './converters/core.mjs';
self.onmessage=async({data})=>{
  try{
    let lastUpdate=0;
    const result=await convert(data.file,data.input,data.output,{...data.options,
      progress:value=>{if(performance.now()-lastUpdate>150){lastUpdate=performance.now();self.postMessage({type:'progress',value});}},
      onFrames:frames=>self.postMessage({type:'frames',frames})});
    self.postMessage({type:'done',...result});
  }catch(error){self.postMessage({type:'error',message:error.message||'文件转换失败'});}
};
