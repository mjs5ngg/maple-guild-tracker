// 격리 조회 엔진이 허용된 설정 메시지만 받아들이는지 검증합니다.
import {describe,expect,it} from "vitest";
import {validConfiguration,validDashboardMessage} from "./directProtocol";

describe("직접 조회 메시지",()=>{
 it("대표와 즐겨찾기 30명 이내의 설정만 허용한다",()=>{
  expect(validConfiguration({type:"configure",primary:"대표",favorites:["친구"],automatic:true})).toBe(true);
  expect(validConfiguration({type:"configure",primary:"대표",favorites:Array.from({length:31},(_,index)=>String(index)),automatic:true})).toBe(false);
  expect(validConfiguration({type:"configure",primary:"대표",favorites:[],automatic:"yes"})).toBe(false);
  expect(validConfiguration({type:"configure",primary:"대표",favorites:[],automatic:true,apiKey:"노출 금지"})).toBe(false);
 });
 it("키나 임의 필드가 들어간 명령을 거부한다",()=>{
  expect(validDashboardMessage({type:"refresh"})).toBe(true);
  expect(validDashboardMessage({type:"delete-key"})).toBe(true);
  expect(validDashboardMessage({type:"refresh",apiKey:"노출 금지"})).toBe(false);
 });
});
