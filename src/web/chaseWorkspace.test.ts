// 따라잡기 그룹 선택과 초기 세션 상태를 검증합니다.
import {describe,expect,it} from "vitest";
import {canToggleWholeGroup,initialChaseWorkspace,sortChaseCandidates} from "./chaseWorkspace";
import type {Snapshot} from "./types";

const row=(name:string,level:number,exp:string):Snapshot=>({ocid:name,basic:{character_name:name,world_name:"스카니아",character_class:"은월",character_level:level,character_exp:exp,character_exp_rate:"0"},observedAt:"2026-09-16T00:00:00Z",history:[]});

describe("따라잡기 작업 공간",()=>{
 it("길드원이 10명 이하일 때만 그룹 전체 선택을 허용한다",()=>{
  expect(canToggleWholeGroup(10)).toBe(true);
  expect(canToggleWholeGroup(11)).toBe(false);
  expect(canToggleWholeGroup(0)).toBe(false);
 });
 it("새 보고서는 30일 빈 선택으로 시작한다",()=>expect(initialChaseWorkspace()).toEqual({periodDays:30,selected:[],sortKey:"catchup",direction:"asc"}));
 it("선택 후보를 레벨, 현재 경험치, 닉네임 순으로 정렬한다",()=>{
  const source=[row("다",281,"99999999999999999"),row("나",282,"2"),row("가",282,"2"),row("라",282,"100000000000000000")];
  expect(sortChaseCandidates(source).map(value=>value.basic.character_name)).toEqual(["라","가","나","다"]);
  expect(source.map(value=>value.basic.character_name)).toEqual(["다","나","가","라"]);
 });
});
