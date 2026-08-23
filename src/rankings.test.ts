// 전체 성장 위치와 오늘 획득량 랭킹 기준을 검증합니다.
import { describe, expect, it } from "vitest";
import { currentGuildRows, favoriteRankingRows, moveFavorite, orderFavorites, sameCharacterOrder, sortByOverallProgress, sortByTodayGain } from "./rankings";
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

  it("길드 랭킹에서는 외부 즐겨찾기를 제외한다", () => {
    const member = row("길드원", 281, 100, 10);
    const external = { ...row("외부", 290, 100, 20), is_current_member: false, is_favorite: true };
    expect(currentGuildRows([external, member])).toEqual([member]);
  });

  it("즐겨찾기 랭킹은 외부 캐릭터를 포함하고 비즐겨찾기를 제외한다", () => {
    const member = { ...row("길드원", 281, 100, 10), is_favorite: true };
    const external = { ...row("외부", 290, 100, 20), is_current_member: false, is_favorite: true };
    const normal = row("일반", 300, 100, 30);
    expect(favoriteRankingRows([member, external, normal], true).map((value) => value.character_name)).toEqual(["외부", "길드원"]);
    expect(favoriteRankingRows([member, external, normal], false).map((value) => value.character_name)).toEqual(["길드원", "외부"]);
  });

  it("저장된 즐겨찾기 순서를 적용하고 새 캐릭터는 뒤에 둔다", () => {
    const rows = [row("가", 281, 100, 10), row("나", 281, 100, 10), row("다", 281, 100, 10)];
    expect(orderFavorites(rows, [rows[1].character_id, rows[0].character_id]).map((value) => value.character_name)).toEqual(["나", "가", "다"]);
  });

  it("저장 순서가 없으면 즐겨찾기를 레벨과 현재 경험치 순으로 정렬한다", () => {
    const rows = [row("가", 281, 900, 10), row("나", 282, 10, 10), row("다", 281, 1_000, 10)];
    expect(orderFavorites(rows, []).map((value) => value.character_name)).toEqual(["나", "다", "가"]);
  });

  it("드래그한 즐겨찾기를 놓은 카드 위치로 이동한다", () => {
    expect(moveFavorite([1, 2, 3], 3, 1)).toEqual([3, 1, 2]);
    expect(moveFavorite([1, 2, 3], 1, 3)).toEqual([2, 3, 1]);
  });

  it("버튼을 놓지 않고 세 번째에서 두 번째와 다시 세 번째로 이동한다", () => {
    const movedUp = moveFavorite([1, 2, 3], 3, 2);
    expect(movedUp).toEqual([1, 3, 2]);
    expect(moveFavorite(movedUp, 3, 2)).toEqual([1, 2, 3]);
  });

  it("기본 레벨순과 실제 순서가 같을 때만 정렬 완료로 판단한다", () => {
    const rows = [row("가", 282, 100, 10), row("나", 281, 100, 10)];
    expect(sameCharacterOrder(rows, [...rows])).toBe(true);
    expect(sameCharacterOrder(rows, [...rows].reverse())).toBe(false);
  });
});
