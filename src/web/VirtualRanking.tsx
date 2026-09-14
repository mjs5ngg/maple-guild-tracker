// 많은 순위 행은 가상화하고 대표캐릭터는 스크롤 위에도 고정해 표시합니다.
import {useRef} from "react";
import {useVirtualizer} from "@tanstack/react-virtual";
import {Crown} from "lucide-react";
import type {Snapshot} from "./types";
import {Avatar} from "./Avatar";
import {compact,periodGain,todayGain} from "./experience";
import {levelUpProjection} from "./projections";
import {rowWarningReasons,WarningBadge} from "./WarningBadge";

const gainLabel=(value:bigint|null)=>value===null?"자료 없음":`+${compact(value)}`;
export const primaryPinnedIndex=(rows:Snapshot[],primaryName:string)=>rows.findIndex(row=>row.basic.character_name===primaryName);

function RankingEntry({row,index,primaryName,selected,onSelect,period,days,pinned=false}:{row:Snapshot;index:number;primaryName:string;selected?:string;onSelect:(row:Snapshot)=>void;period:boolean;days:number;pinned?:boolean}){
 const result=period?periodGain(row,days,__EXP_TABLE__):null,gained=period?result!.value:todayGain(row,__EXP_TABLE__),projection=levelUpProjection(row,__EXP_TABLE__);
 const reasons=rowWarningReasons(row,!period||result!.complete),activate=()=>onSelect(row);
 return <div className={`ranking-row ${row.ocid===selected?"selected":""} ${pinned?"pinned":""}`} onClick={activate} onKeyDown={event=>{if(event.key==="Enter"||event.key===" "){event.preventDefault();activate();}}} role="row" tabIndex={0}>
  <i>{pinned?<Crown aria-label="대표캐릭터"/>:String(index+1).padStart(2,"0")}</i><Avatar character={row}/>
  <span className="identity"><b>{row.basic.character_name===primaryName&&<Crown/>}{row.basic.character_name}{row.isHunting&&<span className="hunting-fire" title="최근 경험치 변화 감지">🔥</span>}</b><small>{pinned?`${index+1}위 · 대표캐릭터`:row.basic.character_class}</small></span>
  <span className="level">Lv.{row.basic.character_level}<small>{row.basic.character_exp_rate}% · 예상 {projection.label}</small></span>
  <strong>{gainLabel(gained)}{period&&!result!.complete?<small>부분값 {result!.collected}/{result!.total}일</small>:row.estimated?<small>추정</small>:null}</strong><WarningBadge reasons={reasons} label={`${row.basic.character_name} 특이사항`}/>
 </div>;
}

export function VirtualRanking({rows,primaryName,selected,onSelect,period,days}:{rows:Snapshot[];primaryName:string;selected?:string;onSelect:(row:Snapshot)=>void;period:boolean;days:number}){
 const parent=useRef<HTMLDivElement>(null),primaryIndex=primaryPinnedIndex(rows,primaryName),primary=primaryIndex>=0?rows[primaryIndex]:undefined;
 const virtualizer=useVirtualizer({count:rows.length,getScrollElement:()=>parent.current,estimateSize:()=>86,overscan:8});
 return <div className="ranking-list" role="table"><div className="ranking-head" role="row"><span>순위</span><span>캐릭터</span><span>레벨 · 현재 경험치</span><span>{period?`${days}일 획득`:"오늘 획득"}</span><span aria-hidden="true"/></div>
  {primary&&<div className="ranking-pinned"><RankingEntry row={primary} index={primaryIndex} primaryName={primaryName} selected={selected} onSelect={onSelect} period={period} days={days} pinned/></div>}
  <div ref={parent} className="ranking-scroll"><div style={{height:`${virtualizer.getTotalSize()}px`,position:"relative"}}>{virtualizer.getVirtualItems().map(item=>{const row=rows[item.index];return <div key={row.ocid} data-index={item.index} ref={virtualizer.measureElement} style={{position:"absolute",top:0,left:0,width:"100%",transform:`translateY(${item.start}px)`}}><RankingEntry row={row} index={item.index} primaryName={primaryName} selected={selected} onSelect={onSelect} period={period} days={days}/></div>;})}</div></div>
 </div>;
}
