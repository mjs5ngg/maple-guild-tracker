// NEXON 점검 오류가 일반 조회 실패와 구분되는지 검증합니다.
import {describe,expect,it} from "vitest";
import {NEXON_MAINTENANCE_MESSAGE,nexonErrorMessage} from "./nexonError";

describe("NEXON API 오류 안내",()=>{
 it("OPENAPI00010을 점검 안내로 변환",()=>{
  expect(nexonErrorMessage(JSON.stringify({error:{name:"OPENAPI00010",message:"Please wait until the game maintenance is finished"}}))).toBe(NEXON_MAINTENANCE_MESSAGE);
 });

 it("알 수 없는 오류와 비 JSON 응답은 일반 안내 유지",()=>{
  expect(nexonErrorMessage(JSON.stringify({error:{name:"OPENAPI00005"}}))).toBe("NEXON API 응답을 확인해 주세요.");
  expect(nexonErrorMessage("upstream error")).toBe("NEXON API 응답을 확인해 주세요.");
 });
});
