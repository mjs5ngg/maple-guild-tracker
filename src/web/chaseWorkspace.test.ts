// 따라잡기 그룹 선택과 초기 세션 상태를 검증합니다.
import {describe,expect,it} from "vitest";
import {canToggleWholeGroup,initialChaseWorkspace} from "./chaseWorkspace";

describe("따라잡기 작업 공간",()=>{
 it("길드원이 10명 이하일 때만 그룹 전체 선택을 허용한다",()=>{
  expect(canToggleWholeGroup(10)).toBe(true);
  expect(canToggleWholeGroup(11)).toBe(false);
  expect(canToggleWholeGroup(0)).toBe(false);
 });
 it("새 보고서는 30일 빈 선택으로 시작한다",()=>expect(initialChaseWorkspace()).toEqual({periodDays:30,selected:[],sortKey:"catchup",direction:"asc"}));
});
