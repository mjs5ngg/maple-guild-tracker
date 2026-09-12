// 웹 정수 보존과 날짜 및 동점 정렬 회귀를 검증합니다.
import {describe,it,expect} from "vitest";
import {parseNexon,gain,dayBefore,sortRows,dailyPoints,periodGain,kstDate,mergeActivity,progressPoints} from "./experience";
import type {Basic,Snapshot} from "./types";
const basic=(level:number,xp:string):Basic=>({character_name:"A",world_name:"스카니아",character_class:"은월",character_level:level,character_exp:xp,character_exp_rate:"1"});
describe("웹 경험치",()=>{
 it("가입 전 획득량도 포함하며 소속 명단 누락은 경험치 집계를 바꾸지 않음",()=>{
 const today=kstDate(),yesterday=dayBefore(today),before=dayBefore(yesterday);
 const s:Snapshot={ocid:"A",basic:basic(200,"9"),observedAt:new Date().toISOString(),history:[{date:before,basic:basic(200,"1")},{date:yesterday,basic:basic(200,"5")}],guildMembership:{[today]:true,[yesterday]:false}};
 expect(periodGain(s,2,["10"])).toEqual({value:8n,complete:true});
 s.guildMembership={[today]:true};
 expect(periodGain(s,2,["10"])).toEqual({value:8n,complete:true});
 s.guildMembership={};
 expect(periodGain(s,2,["10"])).toEqual({value:8n,complete:true});
 });
 it("최근 기간은 오늘 포함이며 오늘 0을 누락으로 보지 않음",()=>{
 const today=kstDate();const s:Snapshot={ocid:"A",basic:basic(200,"5"),observedAt:new Date().toISOString(),history:[{date:dayBefore(today),basic:basic(200,"5")}]};
 expect(dailyPoints(s,7,["10"])).toHaveLength(7);expect(dailyPoints(s,7,["10"])[6]).toEqual({date:today,value:0n});expect(periodGain(s,1,["10"])).toEqual({value:0n,complete:true});expect(periodGain(s,7,["10"]).complete).toBe(false);
 });
 it("공식 전일 기준은 추정 표본보다 우선함",()=>{
 const s:Snapshot={ocid:"A",basic:basic(200,"8"),observedAt:new Date().toISOString(),todayBaseline:basic(200,"3"),history:[{date:dayBefore(kstDate()),basic:basic(200,"5")}]};
 expect(periodGain(s,1,["10"]).value).toBe(3n);
 });
 it("안전 정수 범위 밖의 API 정수를 문자열로 보존",()=>expect((parseNexon('{"character_exp":99999999999999999}') as Basic).character_exp).toBe("99999999999999999"));
 it("동일 레벨과 다중 레벨업 계산",()=>{expect(gain(basic(200,"5"),basic(200,"8"),["10"])).toBe(3n);expect(gain(basic(200,"5"),basic(202,"3"),["10","20"])).toBe(28n);});
 it("누락과 역행을 0으로 바꾸지 않음",()=>{expect(gain(undefined,basic(200,"0"),[])).toBe(null);expect(gain(basic(200,"5"),basic(200,"3"),[])).toBe(null);});
 it("연도 경계 전일",()=>expect(dayBefore("2026-01-01")).toBe("2025-12-31"));
 it("레벨 현재 경험치 닉네임 정렬",()=>{const rows=["나","가"].map(name=>({ocid:name,basic:{...basic(200,"5"),character_name:name},observedAt:"2026-01-01",history:[]} as Snapshot));expect(sortRows(rows,false,[])[0].ocid).toBe("가");});
 it("그래프는 경험치율과 레벨업 지점을 함께 제공",()=>{
  const today=kstDate(),yesterday=dayBefore(today),before=dayBefore(yesterday),snapshot:Snapshot={ocid:"A",basic:{...basic(201,"3"),character_exp_rate:"30"},observedAt:new Date().toISOString(),history:[{date:before,basic:{...basic(200,"2"),character_exp_rate:"20"}},{date:yesterday,basic:{...basic(200,"8"),character_exp_rate:"80"}}]};
  expect(progressPoints(snapshot,2,["10"])).toEqual([{date:yesterday,percent:80,gained:6n,level:200,levelUp:false},{date:today,percent:30,gained:5n,level:201,levelUp:true}]);
 });
 it("개인 조회 활동은 경계값을 제외하고 정상 구간에서만 갱신",()=>{
  const previous:Snapshot={ocid:"A",basic:basic(281,"0"),observedAt:"2026-09-12T00:00:00Z",history:[],isHunting:false};
  const next=(gain:string):Snapshot=>({ocid:"A",basic:basic(281,gain),observedAt:"2026-09-12T00:15:00Z",history:[]});
  expect(mergeActivity(previous,next("1000000001"),[]).isHunting).toBe(true);
  expect(mergeActivity(previous,next("0"),[]).isHunting).toBe(false);
  expect(mergeActivity(previous,next("1"),[]).isHunting).toBe(false);
  expect(mergeActivity(previous,next("1000000000"),[]).isHunting).toBe(false);
  expect(mergeActivity(previous,next("1000000000000"),[]).isHunting).toBe(false);
  expect(mergeActivity(previous,next("1000000000001"),[]).isHunting).toBe(false);
  expect(mergeActivity({...previous,isHunting:true},next("1"),[]).isHunting).toBe(true);
  expect(mergeActivity({...previous,isHunting:true},next("1000000000001"),[]).isHunting).toBe(true);
  expect(mergeActivity({...previous,isHunting:true},next("0"),[]).isHunting).toBe(false);
 });
});
