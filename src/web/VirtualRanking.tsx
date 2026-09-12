// 많은 캐릭터 순위 행을 필요한 화면 구간만 렌더링해 빠르게 표시합니다.
import {useRef} from "react";
import {useVirtualizer} from "@tanstack/react-virtual";
import {Crown} from "lucide-react";
import type {Snapshot} from "./types";
import {Avatar} from "./Avatar";
import {compact,periodGain,todayGain} from "./experience";
import {levelUpProjection} from "./projections";

const gainLabel=(value:bigint|null)=>value===null?"자료 없음":`+${compact(value)}`;
export function VirtualRanking({rows,primaryName,selected,onSelect,period,days,personalOcids}:{rows:Snapshot[];primaryName:string;selected?:string;onSelect:(row:Snapshot)=>void;period:boolean;days:number;personalOcids:Set<string>}){
 const parent=useRef<HTMLDivElement>(null);
 const virtualizer=useVirtualizer({count:rows.length,getScrollElement:()=>parent.current,estimateSize:()=>86,overscan:8});
 return <div className="ranking-list" role="table"><div className="ranking-head" role="row"><span>순위</span><span>캐릭터</span><span>레벨 · 현재 경험치</span><span>{period?`${days}일 획득`:"오늘 획득"}</span><span>조회</span></div><div ref={parent} className="ranking-scroll"><div style={{height:`${virtualizer.getTotalSize()}px`,position:"relative"}}>{virtualizer.getVirtualItems().map(item=>{const row=rows[item.index],result=period?periodGain(row,days,__EXP_TABLE__):null,gained=period?result!.value:todayGain(row,__EXP_TABLE__),projection=levelUpProjection(row,__EXP_TABLE__);return <button key={row.ocid} data-index={item.index} ref={virtualizer.measureElement} style={{position:"absolute",top:0,left:0,width:"100%",transform:`translateY(${item.start}px)`}} className={`ranking-row ${row.ocid===selected?"selected":""}`} onClick={()=>onSelect(row)} role="row"><i>{String(item.index+1).padStart(2,"0")}</i><Avatar character={row}/><span className="identity"><b>{row.basic.character_name===primaryName&&<Crown/>}{row.basic.character_name}{row.isHunting&&<span className="hunting-fire" title="최근 경험치 변화 감지">🔥</span>}</b><small>{row.basic.character_class}</small></span><span className="level">Lv.{row.basic.character_level}<small>{row.basic.character_exp_rate}% · 예상 {projection.label}</small></span><strong>{gainLabel(gained)}{period&&!result!.complete?<small>일부 수집</small>:row.estimated?<small>추정</small>:null}</strong><span className="observed">{personalOcids.has(row.ocid)?"개인":"서버"}<small>{new Date(row.observedAt).toLocaleTimeString("ko-KR",{hour12:false,hour:"2-digit",minute:"2-digit"})}</small></span></button>;})}</div></div></div>;
}
