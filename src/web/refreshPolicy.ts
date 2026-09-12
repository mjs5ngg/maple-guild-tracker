// 공개 웹의 자동 조회와 활동 기록 간격을 한곳에서 정의합니다.
export const DASHBOARD_REFRESH_MS=15*60*1000;
export const ACTIVITY_REFRESH_MS=60*60*1000;

export function refreshDue(lastAt:number,now=Date.now(),interval=DASHBOARD_REFRESH_MS){
 return lastAt<=0||now-lastAt>=interval;
}
