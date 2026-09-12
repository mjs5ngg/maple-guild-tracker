// 최근 7일 기록과 절대 성장 위치로 레벨업 및 추월 예상일을 계산합니다.
import type {Basic,Snapshot} from "./types";
import {dailyPoints,kstDate} from "./experience";

export type Projection={label:string;days:number|null;date:string|null;status:"ready"|"complete"|"insufficient"|"impossible"|"unsupported"};

function addDays(date:string,days:number){const value=new Date(`${date}T00:00:00Z`);value.setUTCDate(value.getUTCDate()+days);return value.toISOString().slice(0,10);}
function ceilingDivide(value:bigint,divisor:bigint){return (value+divisor-1n)/divisor;}
function dateLabel(date:string){const [year,month,day]=date.split("-");return `${year}.${month}.${day}`;}

export function sevenDayAverage(snapshot:Snapshot,table:string[]):bigint|null{
 const points=dailyPoints(snapshot,7,table);
 if(points.length!==7||points.some(point=>point.value===null))return null;
 return points.reduce((sum,point)=>sum+point.value!,0n)/7n;
}

export function absoluteProgress(basic:Basic,table:string[]):bigint|null{
 const level=basic.character_level;
 if(level<200||level>300||table.length<100)return null;
 try{
  let value=BigInt(basic.character_exp);
  for(let current=200;current<level;current++)value+=BigInt(table[current-200]);
  return value;
 }catch{return null;}
}

export function levelUpProjection(snapshot:Snapshot,table:string[],today=kstDate()):Projection{
 const level=snapshot.basic.character_level;
 if(level>=300)return {label:"최고 레벨",days:null,date:null,status:"complete"};
 if(level<200||!table[level-200])return {label:"계산표 갱신 필요",days:null,date:null,status:"unsupported"};
 const average=sevenDayAverage(snapshot,table);
 if(average===null)return {label:"7일 기록 부족",days:null,date:null,status:"insufficient"};
 if(average<=0n)return {label:"예상 불가",days:null,date:null,status:"impossible"};
 try{
  const remaining=BigInt(table[level-200])-BigInt(snapshot.basic.character_exp);
  const days=Math.max(0,Number(ceilingDivide(remaining,average))),date=addDays(today,days);
  return {label:dateLabel(date),days,date,status:"ready"};
 }catch{return {label:"계산표 갱신 필요",days:null,date:null,status:"unsupported"};}
}

export function catchupProjection(primary:Snapshot,target:Snapshot,table:string[],today=kstDate()):Projection{
 const own=absoluteProgress(primary.basic,table),other=absoluteProgress(target.basic,table);
 if(own===null||other===null)return {label:"계산표 갱신 필요",days:null,date:null,status:"unsupported"};
 if(own>=other)return {label:"이미 추월",days:0,date:today,status:"complete"};
 const ownAverage=sevenDayAverage(primary,table),otherAverage=sevenDayAverage(target,table);
 if(ownAverage===null||otherAverage===null)return {label:"7일 기록 부족",days:null,date:null,status:"insufficient"};
 const closing=ownAverage-otherAverage;
 if(closing<=0n)return {label:"현재 추세로 추월 어려움",days:null,date:null,status:"impossible"};
 const exactDays=ceilingDivide(other-own,closing);
 if(exactDays>3650n)return {label:"10년 이상",days:3651,date:null,status:"impossible"};
 const days=Number(exactDays);
 const date=addDays(today,days);return {label:dateLabel(date),days,date,status:"ready"};
}
