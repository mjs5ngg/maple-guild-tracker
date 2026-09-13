// 행 경고가 정상 상태에는 나타나지 않고 실제 특이사항만 설명하는지 검증합니다.
import {describe,expect,it} from "vitest";
import type {Snapshot} from "./types";
import {rowWarningReasons} from "./WarningBadge";

const row=(overrides:Partial<Snapshot>={}):Snapshot=>({ocid:"a",basic:{character_name:"A",world_name:"스카니아",character_class:"은월",character_level:280,character_exp:"1",character_exp_rate:"1"},observedAt:"2026-09-13T01:00:00Z",history:[],...overrides});

describe("순위 특이사항",()=>{
 it("정상 최신 행은 아무 경고도 만들지 않음",()=>expect(rowWarningReasons(row(),true,Date.parse("2026-09-13T01:20:00Z"))).toEqual([]));
 it("추정·누락·지연 사유를 각각 보존",()=>expect(rowWarningReasons(row({estimated:true}),false,Date.parse("2026-09-13T02:00:00Z"))).toHaveLength(3));
});
