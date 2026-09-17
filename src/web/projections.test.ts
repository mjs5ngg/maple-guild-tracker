// 7일 평균과 레벨업 및 추월 예상일 계산의 경계 조건을 검증합니다.
import {describe,expect,it} from "vitest";
import type {Basic,Snapshot} from "./types";
import {absoluteGap,absoluteProgress,catchupProjection,levelUpProjection,sevenDayAverage} from "./projections";
import {dayBefore,kstDate} from "./experience";

const basic=(name:string,level:number,exp:string):Basic=>({character_name:name,world_name:"스카니아",character_class:"은월",character_level:level,character_exp:exp,character_exp_rate:"0"});
function snapshot(name:string,current:string,daily:bigint[],level=200):Snapshot{
 const today=kstDate(),history:{date:string;basic:Basic}[]=[];let exp=BigInt(current)-daily.reduce((sum,value)=>sum+value,0n);
 const first=new Date(Date.parse(`${today}T00:00:00Z`)-6*86400000).toISOString().slice(0,10);
 history.push({date:dayBefore(first),basic:basic(name,level,exp.toString())});
 for(let index=0;index<7;index++){exp+=daily[index];const date=new Date(Date.parse(`${first}T00:00:00Z`)+index*86400000).toISOString().slice(0,10);history.push({date,basic:basic(name,level,exp.toString())});}
 return {ocid:name,basic:basic(name,level,current),observedAt:new Date().toISOString(),history};
}
describe("성장 예상",()=>{
 it("실제 0을 포함한 완전한 7일 평균을 계산한다",()=>expect(sevenDayAverage(snapshot("나","70",[10n,10n,10n,10n,10n,10n,0n]),["1000"])).toBe(60n/7n));
 it("누락일이 있으면 예상하지 않는다",()=>{const row=snapshot("나","70",[10n,10n,10n,10n,10n,10n,0n]);row.history.splice(3,1);expect(sevenDayAverage(row,["1000"])).toBe(null);});
 it("다음 레벨 날짜와 최고 레벨을 구분한다",()=>{const row=snapshot("나","70",[10n,10n,10n,10n,10n,10n,10n]);expect(levelUpProjection(row,["1000"],"2026-09-12").date).toBe("2026-12-14");row.basic.character_level=300;expect(levelUpProjection(row,["1000"],"2026-09-12").label).toBe("최고 레벨");});
 it("누적 위치와 추월 가능성을 계산한다",()=>{const table=Array(100).fill("1000"),mine=snapshot("나","700",[100n,100n,100n,100n,100n,100n,100n]),target=snapshot("상대","900",[50n,50n,50n,50n,50n,50n,50n]);expect(absoluteProgress(mine.basic,table)).toBe(700n);expect(catchupProjection(mine,target,table,"2026-09-12").days).toBe(4);expect(catchupProjection(target,mine,table).label).toBe("이미 추월");});
 it("퍼센트가 아닌 여러 레벨의 누적 경험치로 절대 격차를 계산한다",()=>{const table=Array(100).fill("1000"),mine=basic("나",201,"900"),target=basic("상대",203,"100");mine.character_exp_rate="90";target.character_exp_rate="10";expect(absoluteProgress(mine,table)).toBe(1900n);expect(absoluteProgress(target,table)).toBe(3100n);expect(absoluteGap(mine,target,table)).toBe(1200n);});
 it("10년을 넘는 큰 정수 격차를 날짜 변환 전에 제한한다",()=>{const table=Array(100).fill("1000000000000000"),mine=snapshot("나","7",[1n,1n,1n,1n,1n,1n,1n]),target=snapshot("상대","0",[0n,0n,0n,0n,0n,0n,0n]);target.basic.character_level=299;target.history.forEach(point=>point.basic.character_level=299);expect(catchupProjection(mine,target,table).label).toBe("10년 이상");});
 it("300레벨은 현재 경험치 문자열과 무관하게 성장 상한으로 고정한다",()=>{const table=Array(100).fill("100000");expect(absoluteProgress(basic("만렙",300,"999999999999"),table)).toBe(10_000_000n);});
 it("현재 최고 레벨인 상대는 추월 불가로 표시한다",()=>{const table=Array(100).fill("100000"),mine=snapshot("나","30000",Array(7).fill(3000n),299),target=snapshot("상대","0",Array(7).fill(0n),300);expect(catchupProjection(mine,target,table).label).toBe("상대가 최고 레벨이라 추월 불가");});
 it("상대의 최고 레벨 도달 전에 따라잡으면 날짜를 계산한다",()=>{const table=Array(100).fill("100000"),mine=snapshot("나","30000",Array(7).fill(3000n),299),target=snapshot("상대","70000",Array(7).fill(1000n),299);expect(catchupProjection(mine,target,table,"2026-09-17").days).toBe(20);});
 it("상대의 최고 레벨 도달일과 같은 날이면 추월 성공으로 판정한다",()=>{const table=Array(100).fill("100000"),mine=snapshot("나","30000",Array(7).fill(2334n),299),target=snapshot("상대","70000",Array(7).fill(1000n),299);expect(catchupProjection(mine,target,table,"2026-09-17").days).toBe(30);});
 it("상대가 먼저 최고 레벨에 도달하면 이후 추월 불가로 표시한다",()=>{const table=Array(100).fill("100000"),mine=snapshot("나","30000",Array(7).fill(2000n),299),target=snapshot("상대","70000",Array(7).fill(1000n),299);expect(catchupProjection(mine,target,table).label).toBe("상대가 먼저 최고 레벨에 도달해 추월 불가");});
 it("상대의 평균이 0이면 최고 레벨 경계 없이 기존 추격 속도로 계산한다",()=>{const table=Array(100).fill("100000"),mine=snapshot("나","30000",Array(7).fill(2000n),299),target=snapshot("상대","70000",Array(7).fill(0n),299);expect(catchupProjection(mine,target,table,"2026-09-17").days).toBe(20);});
});
