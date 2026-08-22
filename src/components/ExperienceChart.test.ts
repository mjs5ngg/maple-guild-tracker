// 캐릭터별 성장 그래프 색상이 목록 순서와 무관하게 고정되는지 검증합니다.
import { describe, expect, it } from "vitest";
import { seriesColor } from "./ExperienceChart";

describe("seriesColor", () => {
  it("returns the same color for the same character", () => {
    expect(seriesColor(17)).toBe(seriesColor(17));
  });

  it("gives newly added characters a different color", () => {
    expect(seriesColor(17)).not.toBe(seriesColor(18));
  });
});
