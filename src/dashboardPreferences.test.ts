// 대시보드 선택값이 Windows와 Android 공통 저장소에서 안전하게 복원되는지 검증합니다.
import { describe, expect, it } from "vitest";
import { dashboardPeriodStorageKey, dashboardRankingModeStorageKey, normalizeDashboardPeriod, normalizeDashboardRankingMode, saveDashboardPeriod, saveDashboardRankingMode, storedDashboardPeriod, storedDashboardRankingMode } from "./dashboardPreferences";

function memoryStorage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  };
}

describe("대시보드 선택 기억", () => {
  it("일간과 직접 지정 기간을 복원한다", () => {
    expect(normalizeDashboardPeriod("daily")).toBe("daily");
    expect(normalizeDashboardPeriod("custom:2026-08-01:2026-08-23")).toBe("custom:2026-08-01:2026-08-23");
  });

  it("잘못된 기간과 랭킹 기준은 기본값으로 복원한다", () => {
    expect(normalizeDashboardPeriod("custom:2026-08-23:2026-08-01")).toBe("7d");
    expect(normalizeDashboardPeriod("custom:2026-99-01:2026-99-02")).toBe("7d");
    expect(normalizeDashboardPeriod("unknown")).toBe("7d");
    expect(normalizeDashboardRankingMode("unknown")).toBe("overall");
  });

  it("플랫폼 공통 저장소에 선택값을 기록하고 다시 읽는다", () => {
    const storage = memoryStorage();
    saveDashboardPeriod("30d", storage);
    saveDashboardRankingMode("period", storage);
    expect(storage.getItem(dashboardPeriodStorageKey)).toBe("30d");
    expect(storage.getItem(dashboardRankingModeStorageKey)).toBe("period");
    expect(storedDashboardPeriod(storage)).toBe("30d");
    expect(storedDashboardRankingMode(storage)).toBe("period");
  });
});
