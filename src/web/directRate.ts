// 직접 조회 속도와 서버 재시도 간격을 안전하게 조절합니다.
export const DIRECT_MIN_INTERVAL_MS=4;

export function slowedInterval(current:number){return Math.min(80,Math.max(8,current*2));}

export function recoveredInterval(current:number){return Math.max(DIRECT_MIN_INTERVAL_MS,current-1);}

export function retryAfterDelay(value:string|null,now=Date.now()){
 if(!value)return 0;
 const seconds=Number(value);
 if(Number.isFinite(seconds)&&seconds>=0)return seconds*1000;
 const date=Date.parse(value);
 return Number.isFinite(date)?Math.max(0,date-now):0;
}
