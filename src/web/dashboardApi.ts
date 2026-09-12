// 공개 터널 안내 페이지를 우회하고 대시보드 API 응답 형식을 검증합니다.
import {parseNexon} from "./experience";

export async function dashboardApi(path:string,body?:unknown,methodOrFetcher:string|typeof fetch=fetch){
 const method=typeof methodOrFetcher==="string"?methodOrFetcher:body===undefined?"GET":"POST",fetcher=typeof methodOrFetcher==="function"?methodOrFetcher:fetch;
 const headers:Record<string,string>={"ngrok-skip-browser-warning":"1"};
 if(body!==undefined)headers["Content-Type"]="application/json";
 const response=await fetcher(path,{method,headers,body:body===undefined?undefined:JSON.stringify(body)});
 const text=await response.text();
 let data:Record<string,any>;
 try{data=parseNexon(text) as Record<string,any>;}
 catch{
  if(/^\s*</.test(text))throw new Error("서비스 연결 안내 페이지가 응답했습니다. 화면을 새로고침해 주세요.");
  throw new Error("서비스 응답 형식을 확인할 수 없습니다. 잠시 후 다시 시도해 주세요.");
 }
 if(!response.ok)throw new Error(data.error||"요청 실패");
 return data;
}
