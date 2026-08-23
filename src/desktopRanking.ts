// PC 좌측 순위 탭의 주·보조 표시 순서를 결정합니다.
export type DesktopRankingView = "guild" | "favorites";

export function desktopRankingTabOrder(selected: DesktopRankingView): DesktopRankingView[] {
  return selected === "guild" ? ["guild", "favorites"] : ["favorites", "guild"];
}
