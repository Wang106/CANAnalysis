(() => {
  'use strict';
  const BRIDGE_URL='ws://127.0.0.1:8765';
  const DEVICE_MODELS=[
    {value:'pcan_usb',label:'PEAK PCAN-USB',channels:1,fd:false},
    {value:'pcan_usb_fd',label:'PEAK PCAN-USB FD',channels:1,fd:true},
    {value:'zlg_usbcan_i',label:'周立功 USBCAN-I',channels:1,fd:false},
    {value:'zlg_usbcan_ii',label:'周立功 USBCAN-II',channels:2,fd:false},
    {value:'zlg_usbcanfd',label:'周立功 USBCANFD',channels:2,fd:true},
    {value:'vector_vn16xx',label:'Vector VN16xx',channels:4,fd:true},
    {value:'vector_vn56xx',label:'Vector VN56xx',channels:4,fd:true},
  ];
  const BITRATES=[10000,20000,33333,50000,83333,100000,125000,250000,500000,800000,1000000];
  const DATA_BITRATES=[500000,1000000,2000000,4000000,5000000,8000000];
  const MAX_ROWS=500;
  const byId=id=>document.getElementById(id);
  const model=byId('deviceModel'),channel=byId('channel'),busType=byId('busType'),bitrate=byId('bitrate'),dataBitrate=byId('dataBitrate');
  const probeButton=byId('probeButton'),connectButton=byId('connectButton'),disconnectButton=byId('disconnectButton');
  const bridgeStatus=byId('bridgeStatus'),connectionStatus=byId('connectionStatus'),frameBody=byId('frameBody');
  let socket=null,connected=false,frames=0,errors=0,dropped=0;
  const t=value=>window.__siteI18n?.t(value)||value;

  function fill(select,values,label=value=>String(value)){
    select.replaceChildren(...values.map(value=>new Option(label(value),String(value))));
  }
  function selectedModel(){return DEVICE_MODELS.find(item=>item.value===model.value)||DEVICE_MODELS[0];}
  function updateModel(){
    const item=selectedModel();
    fill(channel,Array.from({length:item.channels},(_,index)=>index+1),value=>`${t('通道')} ${value}`);
    const fdOption=busType.querySelector('option[value="fd"]');
    fdOption.disabled=!item.fd;
    if(!item.fd)busType.value='classic';
    updateBusType();
  }
  function updateBusType(){
    const fd=busType.value==='fd';
    byId('dataBitrateField').hidden=!fd;
  }
  function setBridge(state,text){
    bridgeStatus.className=`status ${state}`;
    bridgeStatus.querySelector('span').textContent=t(text);
  }
  function setConnection(state,text){
    connectionStatus.className=`connection-state ${state}`;
    connectionStatus.textContent=t(text);
  }
  function setControls(isConnected){
    connected=isConnected;
    connectButton.disabled=!socket||socket.readyState!==WebSocket.OPEN||isConnected;
    disconnectButton.disabled=!isConnected;
    for(const input of byId('connectionForm').querySelectorAll('select'))input.disabled=isConnected;
  }
  function send(message){socket?.readyState===WebSocket.OPEN&&socket.send(JSON.stringify(message));}
  function resetCounters(){
    frames=errors=dropped=0;
    byId('frameCount').textContent='0';byId('errorCount').textContent='0';byId('dropCount').textContent='0';
  }
  function clearFrames(){frameBody.innerHTML=`<tr class="empty-row"><td colspan="6">${t('尚未收到报文')}</td></tr>`;resetCounters();}
  function appendFrame(frame){
    frameBody.querySelector('.empty-row')?.remove();
    const row=document.createElement('tr');
    const values=[Number(frame.timestamp||0).toFixed(6),frame.channel??'',`0x${Number(frame.id).toString(16).toUpperCase()}`,frame.dlc??frame.data?.length??0,(frame.data||[]).map(value=>Number(value).toString(16).padStart(2,'0').toUpperCase()).join(' '),frame.direction||'Rx'];
    for(const value of values){const cell=document.createElement('td');cell.textContent=value;row.appendChild(cell);}
    frameBody.prepend(row);
    while(frameBody.rows.length>MAX_ROWS)frameBody.deleteRow(-1);
    byId('frameCount').textContent=String(++frames);
  }
  function handle(message){
    if(message.type==='hello'||message.type==='devices'){
      setBridge('ready','连接服务已就绪');setConnection('','等待连接本机服务');setControls(false);
    }else if(message.type==='connected'){
      setConnection('connected','设备已连接');setControls(true);resetCounters();
    }else if(message.type==='disconnected'){
      setConnection('','设备已断开');setControls(false);
    }else if(message.type==='frame')appendFrame(message.frame);
    else if(message.type==='stats'){
      dropped=Number(message.dropped||0);byId('dropCount').textContent=String(dropped);
    }else if(message.type==='error'){
      byId('errorCount').textContent=String(++errors);setConnection('error',message.message||'连接失败');setControls(false);
    }
  }
  function openBridge(){
    if(socket&&[WebSocket.OPEN,WebSocket.CONNECTING].includes(socket.readyState)){send({action:'list_devices'});return;}
    setBridge('idle','检测中…');probeButton.disabled=true;
    socket=new WebSocket(BRIDGE_URL);
    socket.addEventListener('open',()=>{probeButton.disabled=false;send({action:'hello'});send({action:'list_devices'});});
    socket.addEventListener('message',event=>{try{handle(JSON.parse(event.data));}catch(error){handle({type:'error',message:error.message});}});
    socket.addEventListener('close',()=>{socket=null;setBridge('error','无法连接本机服务，请确认服务已经启动。');setConnection('','等待连接本机服务');setControls(false);probeButton.disabled=false;});
    socket.addEventListener('error',()=>setBridge('error','无法连接本机服务，请确认服务已经启动。'));
  }
  function connectionConfig(){
    return {model:model.value,deviceIndex:Number(byId('deviceIndex').value),channel:Number(channel.value),bitrate:Number(bitrate.value),fd:busType.value==='fd',dataBitrate:Number(dataBitrate.value),listenOnly:true};
  }

  fill(model,DEVICE_MODELS,item=>t(item.label));Array.from(model.options).forEach((option,index)=>option.value=DEVICE_MODELS[index].value);
  fill(bitrate,BITRATES,value=>value===1000000?'1 Mbit/s':`${value/1000} kbit/s`);bitrate.value='500000';
  fill(dataBitrate,DATA_BITRATES,value=>`${value/1000000} Mbit/s`);dataBitrate.value='2000000';
  updateModel();clearFrames();
  model.addEventListener('change',updateModel);busType.addEventListener('change',updateBusType);
  probeButton.addEventListener('click',openBridge);
  byId('connectionForm').addEventListener('submit',event=>{event.preventDefault();setConnection('','正在连接设备…');send({action:'connect',config:connectionConfig()});});
  disconnectButton.addEventListener('click',()=>send({action:'disconnect'}));
  byId('clearButton').addEventListener('click',clearFrames);
  window.addEventListener('beforeunload',()=>{if(connected)send({action:'disconnect'});socket?.close();});
  window.addEventListener('site-language-change',()=>{const value=model.value;fill(model,DEVICE_MODELS,item=>t(item.label));Array.from(model.options).forEach((option,index)=>option.value=DEVICE_MODELS[index].value);model.value=value;updateModel();if(!frames)clearFrames();});
  window.__onlinePage={BRIDGE_URL,DEVICE_MODELS,BITRATES,connectionConfig,openBridge};
})();
