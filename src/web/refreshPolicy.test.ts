// 공개 웹의 요청 절감 간격과 만료 판정을 검증합니다.
import {describe,expect,it} from "vitest";
import {ACTIVITY_REFRESH_MS,DASHBOARD_REFRESH_MS,refreshDue} from "./refreshPolicy";

describe("공개 웹 조회 예산",()=>{
 it("대시보드는 15분 전에 다시 조회하지 않는다",()=>{
  expect(DASHBOARD_REFRESH_MS).toBe(900_000);
  expect(refreshDue(1_000_000,1_899_999)).toBe(false);
  expect(refreshDue(1_000_000,1_900_000)).toBe(true);
 });
 it("활동 기록은 한 시간 간격을 사용한다",()=>expect(ACTIVITY_REFRESH_MS).toBe(3_600_000));
 it("기록이 없으면 즉시 조회한다",()=>expect(refreshDue(0,1)).toBe(true));
});
