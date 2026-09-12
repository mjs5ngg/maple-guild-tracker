// 공개 설정과 수집 본문에서 중복 닉네임 및 원본 JSON 유입을 거부하는지 검증합니다.
import {describe,expect,it} from "vitest";
import {validIngest,validProfile} from "./validation";

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
});
