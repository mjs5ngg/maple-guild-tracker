// 개요 합집합의 OCID 중복 제거를 검증합니다.
import {describe,expect,it} from "vitest";
import type {Snapshot} from "./types";
import {uniqueCharacters} from "./overviewRows";

const row=(ocid:string,name:string)=>({ocid,basic:{character_name:name,world_name:"스카니아",character_class:"은월",character_level:280,character_exp:"0",character_exp_rate:"0"},observedAt:"2026-09-13T00:00:00Z",history:[]} satisfies Snapshot);
it("같은 OCID는 한 번만 남긴다",()=>expect(uniqueCharacters([row("a","A")],[row("a","A"),row("b","B")]).map(value=>value.ocid)).toEqual(["a","b"]));
