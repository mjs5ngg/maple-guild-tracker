// 기존 통합 스냅샷을 현재 정보와 압축 일별 기록으로 안전하게 이관하는지 검증합니다.
import "fake-indexeddb/auto";
import {describe,expect,it} from "vitest";
import type {Snapshot} from "./types";

const openLegacy=()=>new Promise<IDBDatabase>((resolve,reject)=>{
 const request=indexedDB.open("maple-personal-data",1);
 request.onupgradeneeded=()=>{const db=request.result;db.createObjectStore("snapshots",{keyPath:"ocid"});db.createObjectStore("identities",{keyPath:"name"});db.createObjectStore("meta",{keyPath:"key"});};
 request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);
});
const transactionDone=(transaction:IDBTransaction)=>new Promise<void>((resolve,reject)=>{transaction.oncomplete=()=>resolve();transaction.onerror=()=>reject(transaction.error);});

describe("개인 조회 저장소",()=>{
 it("v1의 400명·31일 기록을 압축 v2로 이관하면서 화면 작업에 양보",async()=>{
  const database=await openLegacy(),transaction=database.transaction("snapshots","readwrite"),history=Array.from({length:31},(_,index)=>({date:`2026-08-${String(index+1).padStart(2,"0")}`,basic:{character_level:281,character_exp:String(index),character_exp_rate:String(index)}}));
  for(let index=0;index<400;index++){const legacy:Snapshot={ocid:`ocid-${String(index).padStart(3,"0")}`,basic:{character_name:index===0?"엘크라우치":`길드원${index}`,world_name:"스카니아",character_class:"은월",character_level:281,character_exp:"31",character_exp_rate:"31",character_image:"https://example.com/a.png"},observedAt:"2026-09-15T00:00:00Z",history};transaction.objectStore("snapshots").put(legacy);}
  await transactionDone(transaction);database.close();
  const {directStore}=await import("./directStore");
  let yielded=false;setTimeout(()=>{yielded=true;},0);const rows=await directStore.snapshots(),primary=rows.find(row=>row.ocid==="ocid-000")!;
  expect(yielded).toBe(true);expect(rows).toHaveLength(400);expect(primary.basic.character_name).toBe("엘크라우치");expect(primary.history).toHaveLength(31);expect(primary.history[30].basic).toEqual({character_level:281,character_exp:"30",character_exp_rate:"30"});
  expect(await directStore.meta("normalized-v2")).toBe(true);
 });
});
