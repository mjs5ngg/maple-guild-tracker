// 현재 성장 위치와 오늘 획득량에 따라 캐릭터 순서를 계산합니다.
import type { RankingRow } from "./types";

export function currentGuildRows(rows: RankingRow[]): RankingRow[] {
  return rows.filter((row) => row.is_current_member);
}

export function sortByOverallProgress(rows: RankingRow[]): RankingRow[] {
  return [...rows].sort((left, right) =>
    right.level - left.level
    || (right.current_exp ?? -1) - (left.current_exp ?? -1)
    || left.character_name.localeCompare(right.character_name));
}

export function sortByTodayGain(rows: RankingRow[]): RankingRow[] {
  return [...rows].sort((left, right) =>
    (right.today_exp ?? -1) - (left.today_exp ?? -1)
    || left.character_name.localeCompare(right.character_name));
}
