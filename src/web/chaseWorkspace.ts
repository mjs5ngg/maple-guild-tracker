// 따라잡기 보고서의 탭 간 세션 상태와 그룹 선택 규칙을 정의합니다.
import type {Snapshot} from "./types";
export type SortKey="today"|"period"|"average"|"catchup";
export type Direction="asc"|"desc";
export type ChaseWorkspace={periodDays:7|30;selected:string[];sortKey:SortKey;direction:Direction};

export const initialChaseWorkspace=():ChaseWorkspace=>({periodDays:30,selected:[],sortKey:"catchup",direction:"asc"});
export const canToggleWholeGroup=(count:number)=>count>0&&count<=10;
const parsedExp=(value:string|number):bigint|null=>{try{return BigInt(value);}catch{return null;}};
export const sortChaseCandidates=(rows:Snapshot[]):Snapshot[]=>[...rows].sort((left,right)=>{
 const level=right.basic.character_level-left.basic.character_level;
 if(level)return level;
 const leftExp=parsedExp(left.basic.character_exp),rightExp=parsedExp(right.basic.character_exp);
 if(leftExp===null||rightExp===null){if(leftExp!==rightExp)return leftExp===null?1:-1;}
 else if(leftExp!==rightExp)return leftExp>rightExp?-1:1;
 return left.basic.character_name.localeCompare(right.basic.character_name,"ko");
});
