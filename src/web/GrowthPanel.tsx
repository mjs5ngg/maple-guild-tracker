// 선택한 캐릭터의 기간별 획득 경험치를 지연 로딩 차트로 표시합니다.
import {CartesianGrid,Line,LineChart,ResponsiveContainer,Tooltip,XAxis,YAxis} from "recharts";
import type {Snapshot} from "./types";
import {dailyPoints} from "./experience";

export default function GrowthPanel({character,days}:{character?:Snapshot;days:number}){
 const points=character?dailyPoints(character,days,__EXP_TABLE__).map(point=>({date:point.date.slice(5),xp:point.value===null?null:Number(point.value)/1e12})):[];
 return <section className="surface growth-panel" id="growth" aria-labelledby="growth-title">
  <div className="section-heading"><div><span className="section-kicker">GROWTH FLOW</span><h2 id="growth-title">성장 흐름</h2></div>{character&&<span className="section-meta">{character.basic.character_name} · 오늘 포함 {days}일</span>}</div>
  {character?<div className="chart-area"><ResponsiveContainer width="100%" height="100%"><LineChart data={points} margin={{top:12,right:8,bottom:0,left:-14}}><CartesianGrid stroke="var(--border)" vertical={false}/><XAxis dataKey="date" tick={{fill:"var(--text-muted)",fontSize:12}} axisLine={false} tickLine={false}/><YAxis unit="조" tick={{fill:"var(--text-muted)",fontSize:12}} axisLine={false} tickLine={false}/><Tooltip contentStyle={{background:"var(--surface)",border:"1px solid var(--border)",borderRadius:12}} formatter={(value)=>[`${Number(value).toLocaleString("ko-KR",{maximumFractionDigits:2})}조`,"획득 경험치"]}/><Line type="monotone" dataKey="xp" stroke="var(--accent)" strokeWidth={3} connectNulls={false} dot={{r:3,fill:"var(--surface)",strokeWidth:2}} activeDot={{r:5}}/></LineChart></ResponsiveContainer></div>:<div className="empty-state"><b>성장 기록을 기다리고 있어요.</b><span>대표캐릭터를 저장하고 첫 수집이 끝나면 표시됩니다.</span></div>}
 </section>;
}
