// 공개 대시보드가 격리된 직접 조회 엔진의 상태와 결과만 수신하게 합니다.
import {startTransition,useCallback,useEffect,useRef,useState} from "react";
import type {Snapshot} from "./types";
import type {DashboardToDirect,DirectStatus,DirectToDashboard} from "./directProtocol";

const emptyStatus:DirectStatus={keyStored:false,serviceConfirmed:false,busy:false,completed:0,total:0,failed:0,lastSuccessAt:null,nextRefreshAt:null,cachedCount:0,storagePersistent:null,message:"개인 조회 엔진을 연결하고 있습니다."};

export function useDirectBridge(primary:string,favorites:string[]){
 const port=useRef<MessagePort|null>(null),[status,setStatus]=useState(emptyStatus),[rows,setRows]=useState<Snapshot[]>([]);
 const send=useCallback((message:DashboardToDirect)=>port.current?.postMessage(message),[]);
 useEffect(()=>{
  if(!primary)return;
  const nonce=crypto.randomUUID(),frame=document.createElement("iframe");
  frame.className="direct-engine-frame";frame.title="개인 API 직접 조회 엔진";frame.tabIndex=-1;frame.src=`${__DIRECT_ORIGIN__}/?engine=1#${encodeURIComponent(nonce)}`;
  frame.setAttribute("sandbox","allow-scripts allow-same-origin");document.body.append(frame);
  const channel=new MessageChannel();port.current=channel.port1;
  channel.port1.onmessage=(event:MessageEvent<DirectToDashboard>)=>{
   if(event.data?.type==="status")setStatus(event.data.status);
   else if(event.data?.type==="snapshot"&&Array.isArray(event.data.rows)){const next=event.data.rows.slice(0,1000);startTransition(()=>setRows(next));}
   else if(event.data?.type==="error"){const message=event.data.message;setStatus(value=>({...value,message}));}
  };
  channel.port1.start();
  frame.onload=()=>frame.contentWindow?.postMessage({type:"connect",nonce,configuration:{type:"configure",primary,favorites,automatic:true}},__DIRECT_ORIGIN__,[channel.port2]);
  return()=>{channel.port1.close();port.current=null;frame.remove();};
 },[primary]);
 useEffect(()=>{if(primary)send({type:"configure",primary,favorites,automatic:true});},[primary,favorites.join("\0"),send]);
 return {rows,status,refresh:()=>send({type:"refresh"}),deleteKey:()=>send({type:"delete-key"})};
}
