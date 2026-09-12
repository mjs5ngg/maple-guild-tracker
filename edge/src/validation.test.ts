// 공개 설정과 수집 본문에서 중복 닉네임 및 원본 JSON 유입을 거부하는지 검증합니다.
import {describe,expect,it} from "vitest";
import {validChasePreset,validIngest,validProfile} from "./validation";

describe("공개 입력 검증",()=>{
 it("대표와 고유 즐겨찾기를 허용한다",()=>expect(validProfile({primary:"대표",favorites:["친구"]})).toBe(true));
 it("중복 즐겨찾기와 추가 필드를 거부한다",()=>{
  expect(validProfile({primary:"대표",favorites:["친구","친구"]})).toBe(false);
  expect(validProfile({primary:"대표",favorites:[],admin:true})).toBe(false);
 });
 it("정규화되지 않은 원본 수집을 거부한다",()=>{
  const row={ocid:"o",name:"대표",level:282,exp:"1",expRate:1,observedAt:"2026-09-12T00:00:00Z",basic:{raw:true}};
 expect(validIngest({batchId:"batch_1234567890_ab",sentAt:"2026-09-12T00:00:00Z",current:[row],dailySnapshots:[],todayBaselines:[],guilds:[],sync:{status:"completed",succeeded:1,failed:0}})).toBe(false);
 });
 it("명시적 활동 판정과 따라잡기 프리셋을 검증한다",()=>{
  const current={ocid:"o",name:"대표",level:282,exp:"1",expRate:1,observedAt:"2026-09-12T00:00:00Z",activityDecision:"inactive",activityDecisionAt:"2026-09-12T00:00:00Z"};
  expect(validIngest({batchId:"batch_1234567890_ab",sentAt:"2026-09-12T00:00:00Z",current:[current],dailySnapshots:[],todayBaselines:[],guilds:[],sync:{status:"completed",succeeded:1,failed:0}})).toBe(true);
  expect(validChasePreset({id:"preset_123",name:"길드 추월",periodDays:30,ocids:["o"],sortKey:"catchup",sortDirection:"asc"})).toBe(true);
 expect(validChasePreset({id:"preset_123",name:"길드 추월",periodDays:1,ocids:[],sortKey:"none",sortDirection:"asc"})).toBe(false);
 });
 it("활동 판정과 판정 시각이 분리된 입력을 거부한다",()=>{
  const current={ocid:"o",name:"대표",level:282,exp:"1",expRate:1,observedAt:"2026-09-12T00:00:00Z",activityDecision:"active",activityDecisionAt:null};
  expect(validIngest({batchId:"batch_1234567890_ab",sentAt:"2026-09-12T00:00:00Z",current:[current],dailySnapshots:[],todayBaselines:[],guilds:[],sync:{status:"completed",succeeded:1,failed:0}})).toBe(false);
 });
});
