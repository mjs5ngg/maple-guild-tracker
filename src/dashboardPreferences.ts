// 대시보드의 기간과 랭킹 기준 선택을 플랫폼 공통 로컬 설정으로 관리합니다.
export type DashboardPeriod = "daily" | "7d" | "30d" | `custom:${string}:${string}`;
export type DashboardRankingMode = "overall" | "period";

export const dashboardPeriodStorageKey = "dashboard-period-v1";
export const dashboardRankingModeStorageKey = "dashboard-ranking-mode-v1";

type ReadableStorage = Pick<Storage, "getItem">;
type WritableStorage = Pick<Storage, "setItem">;

export function normalizeDashboardPeriod(value: string | null): DashboardPeriod {
  if (value === "daily" || value === "7d" || value === "30d") return value;
  const match = value?.match(/^custom:(\d{4}-\d{2}-\d{2}):(\d{4}-\d{2}-\d{2})$/);
  const isDate = (date: string) => {
    const parsed = new Date(`${date}T00:00:00Z`);
    return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === date;
  };
  if (match && isDate(match[1]) && isDate(match[2]) && match[1] <= match[2]) return value as DashboardPeriod;
  return "7d";
}

export function normalizeDashboardRankingMode(value: string | null): DashboardRankingMode {
  return value === "period" ? "period" : "overall";
}

export function storedDashboardPeriod(storage: ReadableStorage = localStorage): DashboardPeriod {
  try {
    return normalizeDashboardPeriod(storage.getItem(dashboardPeriodStorageKey));
  } catch {
    return "7d";
  }
}

export function storedDashboardRankingMode(storage: ReadableStorage = localStorage): DashboardRankingMode {
  try {
    return normalizeDashboardRankingMode(storage.getItem(dashboardRankingModeStorageKey));
  } catch {
    return "overall";
  }
}

export function saveDashboardPeriod(period: DashboardPeriod, storage: WritableStorage = localStorage) {
  try { storage.setItem(dashboardPeriodStorageKey, period); } catch { /* 저장소를 사용할 수 없어도 현재 선택은 유지합니다. */ }
}

export function saveDashboardRankingMode(mode: DashboardRankingMode, storage: WritableStorage = localStorage) {
  try { storage.setItem(dashboardRankingModeStorageKey, mode); } catch { /* 저장소를 사용할 수 없어도 현재 선택은 유지합니다. */ }
}
