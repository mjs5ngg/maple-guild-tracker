// 정상 표시는 숨기고 수집·계산 특이사항만 접근 가능한 경고로 보여줍니다.
import {AlertTriangle} from "lucide-react";
import type {Snapshot} from "./types";

const STALE_MS=30*60*1000;

export function rowWarningReasons(row:Snapshot,periodComplete=true,now=Date.now()):string[]{
 const reasons:string[]=[];
 if(row.estimated)reasons.push("오늘 수치는 실시간 관측을 기준으로 한 추정값이며 공식 일별 기록 이후 조정될 수 있습니다.");
 if(!periodComplete)reasons.push("선택 기간 중 수집되지 않은 날짜가 있어 합계가 일부 기록만 반영합니다.");
 const observed=Date.parse(row.observedAt);
 if(Number.isFinite(observed)&&now-observed>STALE_MS)reasons.push("마지막 캐릭터 관측이 30분 이상 지연되고 있습니다.");
 return reasons;
}

export function WarningBadge({reasons,label="특이사항"}:{reasons:string[];label?:string}){
 if(!reasons.length)return <span className="warning-slot" aria-hidden="true"/>;
 return <details className="warning-detail" onClick={event=>event.stopPropagation()}>
  <summary aria-label={label}><AlertTriangle/></summary>
  <div role="status">{reasons.map(reason=><p key={reason}>{reason}</p>)}</div>
 </details>;
}
