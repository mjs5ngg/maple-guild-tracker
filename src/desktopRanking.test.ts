// PC 순위 선택에 따라 좌측 주·보조 탭이 교환되는지 검증합니다.
import { describe, expect, it } from "vitest";
import { desktopRankingTabOrder } from "./desktopRanking";

describe("desktopRankingTabOrder", () => {
  it("길드 순위가 선택되면 즐겨찾기를 보조 탭으로 둔다", () => {
    expect(desktopRankingTabOrder("guild")).toEqual(["guild", "favorites"]);
  });

  it("즐겨찾기 순위가 선택되면 길드를 보조 탭으로 내린다", () => {
    expect(desktopRankingTabOrder("favorites")).toEqual(["favorites", "guild"]);
  });
});
