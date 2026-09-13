// 개요 상위 성장에 사용할 캐릭터 합집합을 OCID 기준으로 만듭니다.
import type {Snapshot} from "./types";

export function uniqueCharacters(...groups:Snapshot[][]):Snapshot[]{
 const result=new Map<string,Snapshot>();
 for(const row of groups.flat())if(!result.has(row.ocid))result.set(row.ocid,row);
 return [...result.values()];
}
