// 개요의 전체 성장 목록을 화면에 보이는 행만 렌더링합니다.
import {useRef} from "react";
import {useVirtualizer} from "@tanstack/react-virtual";
import type {Snapshot} from "./types";
import {Avatar} from "./Avatar";
import {compact,todayGain} from "./experience";

export default function OverviewGrowthList({rows,onSelect}:{rows:Snapshot[];onSelect:(row:Snapshot)=>void}){
 const parent=useRef<HTMLDivElement>(null),virtualizer=useVirtualizer({count:rows.length,getScrollElement:()=>parent.current,estimateSize:()=>72,overscan:6});
 return <div ref={parent} className="overview-growth-scroll"><div className="overview-growth-virtual" style={{height:virtualizer.getTotalSize()}}>{virtualizer.getVirtualItems().map(item=>{const row=rows[item.index],gain=todayGain(row,__EXP_TABLE__);return <button key={row.ocid} ref={virtualizer.measureElement} data-index={item.index} style={{transform:`translateY(${item.start}px)`}} onClick={()=>onSelect(row)}><i>{item.index+1}</i><Avatar character={row}/><span><b>{row.basic.character_name}{row.isHunting&&<span className="hunting-fire" title="최근 경험치 변화 감지">🔥</span>}</b><small>Lv.{row.basic.character_level} · {row.basic.character_exp_rate}%</small></span><strong>{gain===null?"자료 없음":`+${compact(gain)}`}</strong></button>;})}</div></div>;
}
