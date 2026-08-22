// 경험치와 날짜를 화면에 읽기 쉬운 형태로 변환합니다.
export function formatExp(value: number | null | undefined, signed = false): string {
  if (value == null) return "—";
  const sign = signed && value > 0 ? "+" : "";
  const absolute = Math.abs(value);
  const units: Array<[number, string]> = [
    [1_000_000_000_000_000, "천조"],
    [1_000_000_000_000, "조"],
    [100_000_000, "억"],
    [10_000, "만"],
  ];
  for (const [base, label] of units) {
    if (absolute >= base) {
      const amount = value / base;
      return `${sign}${amount.toLocaleString("ko-KR", { maximumFractionDigits: amount < 10 ? 2 : 1 })}${label}`;
    }
  }
  return `${sign}${value.toLocaleString("ko-KR")}`;
}

export function formatCurrentProgress(rate: number | null | undefined, todayExp: number | null | undefined): string {
  if (rate == null) return "—";
  const percent = rate.toLocaleString("ko-KR", { minimumFractionDigits: 3, maximumFractionDigits: 3 });
  if (todayExp == null) return `${percent}% (오늘 집계 중)`;
  const gain = todayExp >= 0 ? `+${formatExp(todayExp)}` : formatExp(todayExp);
  return `${percent}% (${gain})`;
}

export function shortDate(value: string | null): string {
  if (!value) return "자료 없음";
  const [, month, day] = value.split("-");
  return `${Number(month)}월 ${Number(day)}일`;
}

export function syncTime(value: string | null): string {
  if (!value) return "동기화 기록 없음";
  const parsed = new Date(value.endsWith("Z") ? value : `${value}Z`);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString("ko-KR");
}
