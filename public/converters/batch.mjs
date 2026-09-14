const FORMATS=new Set(['asc','log','trc','blf','txt','mf4','mdf']);

export async function detectInputFormat(file){
  const head=new Uint8Array(await file.slice(0,64).arrayBuffer());
  const signature=new TextDecoder().decode(head.subarray(0,8));
  if(signature.startsWith('LOGG'))return 'blf';
  if(signature==='MDF     ')return new DataView(head.buffer,head.byteOffset,head.byteLength).getUint16(28,true)>=400?'mf4':'mdf';
  const extension=file.name.includes('.')?file.name.split('.').pop().toLowerCase():'';
  if(FORMATS.has(extension))return extension;
  throw Error('无法自动识别文件“'+file.name+'”，请检查文件扩展名');
}

export function outputName(file,extension){
  const dot=file.name.lastIndexOf('.'),base=dot>0?file.name.slice(0,dot):file.name;
  return base+'.'+extension;
}

export async function planBatch(files,output,override='auto'){
  if(!FORMATS.has(output))throw Error('请选择支持的目标格式');
  if(override!=='auto'&&files.length!==1)throw Error('多个不同格式文件必须使用自动识别');
  const items=[];
  for(const file of files){
    const input=override==='auto'?await detectInputFormat(file):override;
    items.push({file,input,output,outputName:outputName(file,output)});
  }
  return {convert:items.filter(item=>item.input!==output),skipped:items.filter(item=>item.input===output)};
}
