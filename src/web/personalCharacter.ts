// 한 번의 개인 새로고침 안에서만 동일 캐릭터의 조회 결과를 재사용합니다.
import type {Snapshot} from "./types";
export function personalCharacter(request:(path:string,params:Record<string,string>)=>Promise<any>){
 const cache=new Map<string,Snapshot>();
 return async (name:string):Promise<Snapshot>=>{
  const cached=cache.get(name);if(cached)return cached;
  const id=await request("id",{character_name:name});
  const basic=await request("character/basic",{ocid:id.ocid});
  const row={ocid:id.ocid,basic,observedAt:new Date().toISOString(),history:[]};
  cache.set(name,row);return row;
 };
}
