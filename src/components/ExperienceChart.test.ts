// 캐릭터별 성장 그래프 색상이 목록 순서와 무관하게 고정되는지 검증합니다.
import { describe, expect, it } from "vitest";
import { seriesColor, seriesForPeriod } from "./ExperienceChart";

describe("seriesColor", () => {
  it("returns the same color for the same character", () => {
    expect(seriesColor(17)).toBe(seriesColor(17));
  });

  it("gives newly added characters a different color", () => {
    expect(seriesColor(17)).not.toBe(seriesColor(18));
  });

  it("일간 그래프에서는 선택한 오늘 날짜만 남긴다", () => {
    const series = [
      { date: "2026-08-21", character_id: 1, character_name: "대표", gained_exp: 100 },
      { date: "2026-08-22", character_id: 1, character_name: "대표", gained_exp: 200 },
    ];
    expect(seriesForPeriod(series, "daily", "2026-08-22")).toEqual([series[1]]);
    expect(seriesForPeriod(series, "7d", "2026-08-21")).toEqual(series);
  });
});
