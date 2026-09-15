// 직접 조회 속도 제한과 429 복구 규칙을 검증합니다.
import {describe,expect,it} from "vitest";
import {DIRECT_MIN_INTERVAL_MS,recoveredInterval,retryAfterDelay,slowedInterval} from "./directRate";

describe("직접 조회 속도 조절",()=>{
 it("정상 상태에서 초당 최대 250건으로 시작한다",()=>expect(1000/DIRECT_MIN_INTERVAL_MS).toBe(250));
 it("429에서 속도를 절반으로 낮추고 정상 응답 뒤 점진적으로 회복한다",()=>{
  expect(slowedInterval(4)).toBe(8);
  expect(slowedInterval(8)).toBe(16);
  expect(recoveredInterval(8)).toBe(7);
  expect(recoveredInterval(4)).toBe(4);
 });
 it("Retry-After의 초와 HTTP 날짜 형식을 모두 해석한다",()=>{
  expect(retryAfterDelay("3",1_000)).toBe(3_000);
  expect(retryAfterDelay("Thu, 01 Jan 1970 00:00:06 GMT",1_000)).toBe(5_000);
  expect(retryAfterDelay(null,1_000)).toBe(0);
 });
});
