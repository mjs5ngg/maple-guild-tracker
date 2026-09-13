// 대시보드와 격리 조회 iframe 사이에서 허용하는 메시지를 정의합니다.
import type {Snapshot} from "./types";

export type DirectStatus={keyStored:boolean;serviceConfirmed:boolean;busy:boolean;completed:number;total:number;failed:number;lastSuccessAt:string|null;nextRefreshAt:string|null;cachedCount:number;storagePersistent:boolean|null;message:string};
export type DashboardToDirect={type:"configure";primary:string;favorites:string[];automatic:boolean}|{type:"refresh"}|{type:"delete-key"};
export type DirectToDashboard={type:"status";status:DirectStatus}|{type:"snapshot";rows:Snapshot[]}|{type:"error";message:string};

export function validConfiguration(value:unknown):value is Extract<DashboardToDirect,{type:"configure"}>{
 if(!value||typeof value!=="object")return false;
 const item=value as Record<string,unknown>;
 return Object.keys(item).every(key=>["type","primary","favorites","automatic"].includes(key))&&item.type==="configure"&&typeof item.primary==="string"&&item.primary.length<=20&&Array.isArray(item.favorites)&&item.favorites.length<=30&&item.favorites.every(name=>typeof name==="string"&&name.length<=20)&&typeof item.automatic==="boolean";
}

export function validDashboardMessage(value:unknown):value is DashboardToDirect{
 if(validConfiguration(value))return true;
 if(!value||typeof value!=="object")return false;
 const item=value as Record<string,unknown>;
 return Object.keys(item).length===1&&(item.type==="refresh"||item.type==="delete-key");
}
