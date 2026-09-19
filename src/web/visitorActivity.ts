// 개인정보 없이 공개 웹의 익명 이용 현황을 낮은 빈도로 전송합니다.
import {APP_MODE,apiUrl} from "./appMode";
import {appFetch} from "./nativeFetch";
const VISITOR_KEY="web-anonymous-visitor-v1";
const LAST_ACTIVITY_KEY="web-anonymous-activity-at-v1";
const SESSION_KEY="web-anonymous-session-reported-v1";
export const ACTIVITY_INTERVAL_MS=60*60*1000;

function storageValue(storage:Storage,key:string){try{return storage.getItem(key);}catch{return null;}}
function writeStorage(storage:Storage,key:string,value:string){try{storage.setItem(key,value);}catch{/* 저장 차단 시 현재 문서에서만 집계합니다. */}}
async function digest(value:string){const bytes=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(value));return [...new Uint8Array(bytes)].map(byte=>byte.toString(16).padStart(2,"0")).join("");}

export async function reportVisitorActivity(fetcher:typeof fetch=appFetch as typeof fetch,now=Date.now()){
 const sessionStart=storageValue(sessionStorage,SESSION_KEY)!=="1";
 const last=Number(storageValue(localStorage,LAST_ACTIVITY_KEY)||0);
 if(!sessionStart&&Number.isFinite(last)&&now-last<ACTIVITY_INTERVAL_MS)return false;
 let visitor=storageValue(localStorage,VISITOR_KEY);
 if(!visitor){visitor=crypto.randomUUID();writeStorage(localStorage,VISITOR_KEY,visitor);}
 const visitorHash=await digest(visitor);
 const response=await fetcher(apiUrl("/api/activity"),{method:"POST",headers:{"Content-Type":APP_MODE?"text/plain":"application/json"},body:JSON.stringify({visitor:visitorHash,sessionStart}),keepalive:true});
 if(!response.ok)throw new Error("anonymous activity failed");
 writeStorage(localStorage,LAST_ACTIVITY_KEY,String(now));
 writeStorage(sessionStorage,SESSION_KEY,"1");
 return true;
}
