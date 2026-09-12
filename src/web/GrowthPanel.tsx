// 선택한 캐릭터의 날짜별 경험치율과 레벨업 및 획득량 상세를 표시합니다.
import {CartesianGrid,Line,LineChart,ResponsiveContainer,Tooltip,XAxis,YAxis} from "recharts";
import type {Snapshot} from "./types";
import {compact,progressPoints} from "./experience";

function GrowthTooltip({active,payload,label}:any){
 const point=payload?.[0]?.payload;
 if(!active||!point)return null;
 return <div className="chart-tooltip"><b>{label}</b><span>레벨 <strong>{point.level===null?"자료 없음":`Lv.${point.level}`}</strong></span><span>경험치율 <strong>{point.percent===null?"자료 없음":`${point.percent.toLocaleString("ko-KR",{maximumFractionDigits:3})}%`}</strong></span><span>획득 경험치 <strong>{point.gained===null?"자료 없음":`+${compact(point.gained)}`}</strong></span>{point.levelUp&&<em>UP! 레벨업</em>}</div>;
}
function LevelDot({cx,cy,payload}:any){if(cx===undefined||cy===undefined)return null;return <g><circle cx={cx} cy={cy} r="4" fill="var(--surface)" stroke="var(--accent)" strokeWidth="2"/>{payload.levelUp&&<text x={cx} y={cy+20} className="level-up-marker" textAnchor="middle">UP!</text>}</g>;}

export default function GrowthPanel({character,days,onDays}:{character?:Snapshot;days:number;onDays?:(value:1|7|30)=>void}){
 const points=character?progressPoints(character,days,__EXP_TABLE__).map(point=>({...point,date:point.date.slice(5)})):[];
 return <section className="surface growth-panel" id="growth" aria-labelledby="growth-title">
  <div className="section-heading"><div><span className="section-kicker">EXP PROGRESS</span><h2 id="growth-title">경험치율 흐름</h2></div>{onDays?<div className="period-control" aria-label="그래프 기간">{([1,7,30] as const).map(value=><button key={value} aria-pressed={days===value} onClick={()=>onDays(value)}>{value===1?"오늘":`${value}일`}</button>)}</div>:character&&<span className="section-meta">{character.basic.character_name} · 오늘 포함 {days}일</span>}</div>
  {character?<div className="chart-area"><ResponsiveContainer width="100%" height="100%"><LineChart data={points} margin={{top:16,right:8,bottom:28,left:-14}}><CartesianGrid stroke="var(--border)" vertical={false}/><XAxis dataKey="date" tick={{fill:"var(--text-muted)",fontSize:12}} tickMargin={27} axisLine={false} tickLine={false}/><YAxis domain={[0,100]} ticks={[0,25,50,75,100]} unit="%" tick={{fill:"var(--text-muted)",fontSize:12}} axisLine={false} tickLine={false}/><Tooltip content={<GrowthTooltip/>}/><Line type="monotone" dataKey="percent" stroke="var(--accent)" strokeWidth={3} connectNulls={false} dot={<LevelDot/>} activeDot={{r:6}}/></LineChart></ResponsiveContainer></div>:<div className="empty-state"><b>성장 기록을 기다리고 있어요.</b><span>대표캐릭터를 저장하고 첫 수집이 끝나면 표시됩니다.</span></div>}
 </section>;
}
