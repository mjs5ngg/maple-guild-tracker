// 전체 성장 위치와 오늘 획득량 랭킹 기준을 검증합니다.
import { describe, expect, it } from "vitest";
import { sortByOverallProgress, sortByTodayGain } from "./rankings";
import type { RankingRow } from "./types";

function row(character_name: string, level: number, current_exp: number | null, today_exp: number | null): RankingRow {
  return {
    character_id: character_name.charCodeAt(0), rank: 0, character_name, character_class: "",
    character_image: null, level, current_exp, gained_exp: null, current_exp_rate: null,
    today_exp, gap_from_primary: null, is_primary: false, is_favorite: false,
    is_current_member: true, status: "정상", is_hunting: false, live_updated_at: null,
  };
}

describe("경험치 랭킹", () => {
  it("전체 경험치는 레벨을 먼저 보고 같은 레벨에서는 현재 경험치를 비교한다", () => {
    const rows = [row("가", 281, 900, 100), row("나", 282, 10, 0), row("다", 281, 1_000, 50)];
    expect(sortByOverallProgress(rows).map((value) => value.character_name)).toEqual(["나", "다", "가"]);
  });

  it("오늘 랭킹은 완료일 획득량이 아니라 today_exp를 사용한다", () => {
    const rows = [row("가", 282, 10, 20), row("나", 281, 1_000, 300)];
    expect(sortByTodayGain(rows).map((value) => value.character_name)).toEqual(["나", "가"]);
  });
});
