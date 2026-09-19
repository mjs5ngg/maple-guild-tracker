// Android 앱에서는 WebView 대신 네이티브 네트워크로 서버와 NEXON을 호출해 WebView 전용 DNS 실패를 피합니다.
import {APP_MODE} from "./appMode";

type NetEvent={data:string};
type AndroidNetObject={postMessage:(message:string)=>void;addEventListener?:(type:"message",listener:(event:NetEvent)=>void)=>void;onmessage?:((event:NetEvent)=>void)|null};
type NetResult={id:string;status:number;body?:string;headers?:Record<string,string>;error?:string};
declare global { interface Window { AndroidNet?:AndroidNetObject } }

const pending=new Map<string,{resolve:(value:Response)=>void;reject:(reason:unknown)=>void}>();
let listening:AndroidNetObject|null=null;
const NULL_BODY_STATUS=new Set([101,204,205,304]);

export function settleNative(raw:string){
 let result:NetResult;try{result=JSON.parse(raw) as NetResult;}catch{return;}
 const waiter=pending.get(result.id);if(!waiter)return;pending.delete(result.id);
 if(!result.status){waiter.reject(new TypeError(result.error||"네트워크 연결에 실패했습니다."));return;}
 waiter.resolve(new Response(NULL_BODY_STATUS.has(result.status)?null:result.body??"",{status:result.status,headers:result.headers}));
}
function listen(net:AndroidNetObject){
 if(listening===net)return;listening=net;
 const handler=(event:NetEvent)=>settleNative(String(event.data));
 if(net.addEventListener)net.addEventListener("message",handler);else net.onmessage=handler;
}

export function appFetch(input:string|URL,init:RequestInit={}):Promise<Response>{
 const net=typeof window==="undefined"?undefined:window.AndroidNet;
 if(!APP_MODE||!net)return fetch(input,init);
 listen(net);
 const id=crypto.randomUUID(),signal=init.signal;
 return new Promise((resolve,reject)=>{
  if(signal?.aborted){reject(signal.reason);return;}
  pending.set(id,{resolve,reject});
  signal?.addEventListener("abort",()=>{if(pending.delete(id))reject(signal.reason);},{once:true});
  net.postMessage(JSON.stringify({id,method:(init.method||"GET").toUpperCase(),url:String(input),headers:Object.fromEntries(new Headers(init.headers).entries()),body:typeof init.body==="string"?init.body:null}));
 });
}
