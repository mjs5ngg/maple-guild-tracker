// 현재 성장 위치와 오늘 획득량에 따라 캐릭터 순서를 계산합니다.
import type { RankingRow } from "./types";

export function currentGuildRows(rows: RankingRow[]): RankingRow[] {
  return rows.filter((row) => row.is_current_member);
}

export function sortByOverallProgress(rows: RankingRow[]): RankingRow[] {
  return [...rows].sort((left, right) =>
    right.level - left.level
    || (right.current_exp ?? -1) - (left.current_exp ?? -1)
    || compareNames(left.character_name, right.character_name));
}

function compareNames(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

export function sortByTodayGain(rows: RankingRow[]): RankingRow[] {
  return [...rows].sort((left, right) =>
    (right.today_exp ?? -1) - (left.today_exp ?? -1)
    || right.level - left.level
    || (right.current_exp ?? -1) - (left.current_exp ?? -1)
    || compareNames(left.character_name, right.character_name));
}

export function sortFavoritesByLevel(rows: RankingRow[]): RankingRow[] {
  return sortByOverallProgress(rows);
}

export function favoriteRankingRows(rows: RankingRow[], overall: boolean): RankingRow[] {
  const favorites = rows.filter((row) => row.is_favorite);
  return overall ? sortByOverallProgress(favorites) : favorites;
}

export function orderFavorites(rows: RankingRow[], savedOrder: number[]): RankingRow[] {
  const defaults = sortFavoritesByLevel(rows);
  const positions = new Map(savedOrder.map((id, index) => [id, index]));
  return defaults
    .map((row, index) => ({ row, index }))
    .sort((left, right) => {
      const leftPosition = positions.get(left.row.character_id);
      const rightPosition = positions.get(right.row.character_id);
      if (leftPosition !== undefined && rightPosition !== undefined) return leftPosition - rightPosition;
      if (leftPosition !== undefined) return -1;
      if (rightPosition !== undefined) return 1;
      return left.index - right.index;
    })
    .map(({ row }) => row);
}

export function moveFavorite(ids: number[], draggedId: number, targetId: number): number[] {
  if (draggedId === targetId || !ids.includes(draggedId) || !ids.includes(targetId)) return ids;
  const targetIndex = ids.indexOf(targetId);
  const next = ids.filter((id) => id !== draggedId);
  next.splice(targetIndex, 0, draggedId);
  return next;
}

export function sameCharacterOrder(left: RankingRow[], right: RankingRow[]): boolean {
  return left.length === right.length
    && left.every((row, index) => row.character_id === right[index]?.character_id);
}
