// 대표캐릭터 고정 행이 실제 순위를 보존하는지 검증합니다.
import {expect,it} from "vitest";
import type {Snapshot} from "./types";
import {primaryPinnedIndex} from "./VirtualRanking";

const row=(name:string):Snapshot=>({ocid:name,basic:{character_name:name,world_name:"스카니아",character_class:"은월",character_level:280,character_exp:"1",character_exp_rate:"1"},observedAt:new Date().toISOString(),history:[]});
it("대표 고정 행은 스크롤 목록 안 실제 위치를 사용",()=>expect(primaryPinnedIndex([row("A"),row("대표"),row("B")],"대표")).toBe(1));
