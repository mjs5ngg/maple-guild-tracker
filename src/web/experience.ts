// 원본 정수를 보존하고 기존 Rust 경험치표로 웹 증가량을 계산합니다.
import type {HistoryBasic,Snapshot} from "./types";
const KST_FORMATTER=new Intl.DateTimeFormat("sv-SE",{timeZone:"Asia/Seoul",year:"numeric",month:"2-digit",day:"2-digit"});
type DailyCache={today:string;table:string[];points:{date:string;value:bigint|null;basic?:HistoryBasic;previous?:HistoryBasic}[]};
const dailyCache=new WeakMap<Snapshot,DailyCache>();
export function parseNexon(text:string):unknown {
 return JSON.parse(text.replace(/("character_exp"\s*:\s*)(\d+)(?=\s*[,}])/g,'$1"$2"'));
}
export function gain(from:HistoryBasic|undefined,to:HistoryBasic|undefined,table:string[]):bigint|null {
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
export function kstDate(date=new Date()){return KST_FORMATTER.format(date);}
export function dayBefore(date:string){return new Date(Date.parse(date+"T00:00:00Z")-86400000).toISOString().slice(0,10);}
const offsetDay=(date:string,offset:number)=>new Date(Date.parse(date+"T00:00:00Z")+offset*86400000).toISOString().slice(0,10);
function cachedDaily(s:Snapshot,table:string[]){
 const today=kstDate(),saved=dailyCache.get(s);if(saved&&saved.today===today&&saved.table===table)return saved.points;
 const history=new Map(s.history.map(point=>[point.date,point.basic])),observedToday=kstDate(new Date(s.observedAt))===today,points:DailyCache["points"]=[];
 for(let offset=-29;offset<=0;offset++){const date=offsetDay(today,offset),basic=offset===0?(observedToday?s.basic:undefined):history.get(date),previous=history.get(offsetDay(date,-1))||(offset===0?s.todayBaseline:undefined);points.push({date,basic,previous,value:gain(previous,basic,table)});}
 dailyCache.set(s,{today,table,points});return points;
}
export function todayGain(s:Snapshot,table:string[]){const points=cachedDaily(s,table);return points[points.length-1]?.value??null;}
export function dailyPoints(s:Snapshot,days:number,table:string[]) {return cachedDaily(s,table).slice(-days).map(({date,value})=>({date,value}));}
export function progressPoints(s:Snapshot,days:number,table:string[]){
 return cachedDaily(s,table).slice(-days).map(point=>{
  const rate=point.basic?Number(point.basic.character_exp_rate):NaN;
  return {date:point.date,percent:Number.isFinite(rate)?rate:null,gained:point.value,level:point.basic?.character_level??null,levelUp:Boolean(point.basic&&point.previous&&point.basic.character_level>point.previous.character_level)};
 });
}
export function mergeActivity(previous:Snapshot|undefined,current:Snapshot,table:string[]):Snapshot{
 if(!previous)return current;
 const value=gain(previous.basic,current.basic,table);
 if(value===0n)return {...current,isHunting:false,activityDecidedAt:current.observedAt};
 if(value!==null&&value>1_000_000_000n&&value<1_000_000_000_000n)return {...current,isHunting:true,activityDecidedAt:current.observedAt};
 return {...current,isHunting:previous.isHunting,activityDecidedAt:previous.activityDecidedAt};
}
export function periodGain(s:Snapshot,days:number,table:string[]){
 const points=dailyPoints(s,days,table);
 const valid=points.filter(p=>p.value!==null);
 return {value:points.length===0?0n:valid.length?valid.reduce((sum,p)=>sum+p.value!,0n):null,complete:valid.length===points.length,collected:valid.length,total:points.length};
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
