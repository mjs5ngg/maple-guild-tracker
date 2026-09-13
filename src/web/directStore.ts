// 개인 조회 결과와 OCID 대응을 격리된 브라우저 저장소에 보관합니다.
import type {Snapshot} from "./types";

const DB_NAME="maple-personal-data",DB_VERSION=1;
type Identity={name:string;ocid:string;checkedAt:number};
type MetaValue={key:string;value:unknown};

function database():Promise<IDBDatabase>{
 return new Promise((resolve,reject)=>{
  const request=indexedDB.open(DB_NAME,DB_VERSION);
  request.onupgradeneeded=()=>{
   const db=request.result;
   if(!db.objectStoreNames.contains("snapshots"))db.createObjectStore("snapshots",{keyPath:"ocid"});
   if(!db.objectStoreNames.contains("identities"))db.createObjectStore("identities",{keyPath:"name"});
   if(!db.objectStoreNames.contains("meta"))db.createObjectStore("meta",{keyPath:"key"});
  };
  request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);
 });
}
function requestValue<T>(request:IDBRequest<T>):Promise<T>{return new Promise((resolve,reject)=>{request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});}
async function transaction<T>(store:string,mode:IDBTransactionMode,work:(value:IDBObjectStore)=>IDBRequest<T>){const db=await database();try{return await requestValue(work(db.transaction(store,mode).objectStore(store)));}finally{db.close();}}

export const directStore={
 snapshots:()=>transaction<Snapshot[]>("snapshots","readonly",store=>store.getAll()),
 snapshot:(ocid:string)=>transaction<Snapshot|undefined>("snapshots","readonly",store=>store.get(ocid)),
 saveSnapshot:(value:Snapshot)=>transaction<IDBValidKey>("snapshots","readwrite",store=>store.put(value)),
 identity:(name:string)=>transaction<Identity|undefined>("identities","readonly",store=>store.get(name)),
 saveIdentity:(value:Identity)=>transaction<IDBValidKey>("identities","readwrite",store=>store.put(value)),
 deleteIdentity:(name:string)=>transaction<undefined>("identities","readwrite",store=>store.delete(name)),
 meta:async<T>(key:string)=>((await transaction<MetaValue|undefined>("meta","readonly",store=>store.get(key)))?.value as T|undefined),
 saveMeta:(key:string,value:unknown)=>transaction<IDBValidKey>("meta","readwrite",store=>store.put({key,value})),
};
