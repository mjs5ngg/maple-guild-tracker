// 원본 정수를 보존하고 기존 Rust 경험치표로 웹 증가량을 계산합니다.
import type {Basic,Snapshot} from "./types";
export function parseNexon(text:string):unknown {
 return JSON.parse(text.replace(/("character_exp"\s*:\s*)(\d+)(?=\s*[,}])/g,'$1"$2"'));
}
export function gain(from:Basic|undefined,to:Basic|undefined,table:string[]):bigint|null {
 if(!from||!to)return null;
 try {
 const a=BigInt(from.character_exp),b=BigInt(to.character_exp);
 if(a<0n||b<0n||to.character_level<from.character_level)return null;
 if(to.character_level===from.character_level)return b>=a?b-a:null;
 let total=b-a;
 for(let level=from.character_level;level<to.character_level;level++){
 const required=table[level-200]; if(!required)return null;
 if(level===from.character_level&&a>BigInt(required))return null;
 total+=BigInt(required);
 }
 return total>=0n?total:null;
 }catch{return null;}
}
export function kstDate(date=new Date()){return new Intl.DateTimeFormat("sv-SE",{timeZone:"Asia/Seoul",year:"numeric",month:"2-digit",day:"2-digit"}).format(date);}
export function dayBefore(date:string){return new Date(Date.parse(date+"T00:00:00Z")-86400000).toISOString().slice(0,10);}
export function todayGain(s:Snapshot,table:string[]){
 const today=kstDate();
 if(kstDate(new Date(s.observedAt))!==today)return null;
 return gain(s.history.find(h=>h.date===dayBefore(today))?.basic||s.todayBaseline,s.basic,table);
}
export function dailyPoints(s:Snapshot,days:number,table:string[]) {
 const today=kstDate(); const result:{date:string;value:bigint|null}[]=[];
 for(let offset=days-1;offset>=0;offset--){
 const date=new Date(Date.parse(today+'T00:00:00Z')-offset*86400000).toISOString().slice(0,10);
 const current=s.history.find(h=>h.date===date)?.basic;
 result.push({date,value:date===today?todayGain(s,table):gain(s.history.find(h=>h.date===dayBefore(date))?.basic,current,table)});
 }
 return result;
}
export function periodGain(s:Snapshot,days:number,table:string[]){
 const points=dailyPoints(s,days,table);const valid=points.filter(p=>p.value!==null);
 return {value:valid.length?valid.reduce((sum,p)=>sum+p.value!,0n):null,complete:valid.length===days};
}
export function compact(value:bigint|null){
 if(value===null)return "자료 없음";
 const units:[bigint,string][]=[[1000000000000n,"조"],[100000000n,"억"],[10000n,"만"]];
 for(const [size,label] of units)if(value>=size)return (Number(value*10n/size)/10).toLocaleString("ko-KR")+label;
 return value.toString();
}
export function sortRows(rows:Snapshot[],period:boolean,table:string[]){
 return [...rows].sort((a,b)=>{
 if(period){const x=todayGain(a,table),y=todayGain(b,table);if(x!==y){if(x===null)return 1;if(y===null)return -1;return x>y?-1:1;}}
 const level=b.basic.character_level-a.basic.character_level;if(level)return level;
 const x=BigInt(a.basic.character_exp),y=BigInt(b.basic.character_exp);
 return x!==y?(x>y?-1:1):(a.basic.character_name<b.basic.character_name?-1:a.basic.character_name>b.basic.character_name?1:0);
 });
}
