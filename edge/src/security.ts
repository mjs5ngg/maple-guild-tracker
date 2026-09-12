// 내부 수집 요청의 HMAC 서명과 세션 해시를 Web Crypto로 계산합니다.
const encoder=new TextEncoder();

function hex(bytes:Uint8Array){return [...bytes].map(value=>value.toString(16).padStart(2,"0")).join("");}

export async function sha256(value:string){
 return hex(new Uint8Array(await crypto.subtle.digest("SHA-256",encoder.encode(value))));
}

export async function hmac(secret:string,value:string){
 const key=await crypto.subtle.importKey("raw",encoder.encode(secret),{name:"HMAC",hash:"SHA-256"},false,["sign"]);
 return hex(new Uint8Array(await crypto.subtle.sign("HMAC",key,encoder.encode(value))));
}

export function constantTimeEqual(left:string,right:string){
 if(left.length!==right.length)return false;
 let difference=0;
 for(let index=0;index<left.length;index++)difference|=left.charCodeAt(index)^right.charCodeAt(index);
 return difference===0;
}

export function signedPayload(timestamp:string,batchId:string,body:string){return `${timestamp}.${batchId}.${body}`;}

export function timestampMilliseconds(timestamp:string){return timestamp.length===10?Number(timestamp)*1000:Number(timestamp);}

export async function signatureMatches(secret:string,timestamp:string,batchId:string,body:string,signature:string,now=Date.now()){
 if(!/^\d{10,13}$/.test(timestamp)||!/^[A-Za-z0-9_-]{16,100}$/.test(batchId))return false;
 const milliseconds=timestampMilliseconds(timestamp);
 if(!Number.isFinite(milliseconds)||Math.abs(now-milliseconds)>5*60*1000)return false;
 if(!/^[a-f0-9]{64}$/i.test(signature))return false;
 const expected=await hmac(secret,signedPayload(timestamp,batchId,body));
 return constantTimeEqual(expected,signature.toLowerCase());
}
