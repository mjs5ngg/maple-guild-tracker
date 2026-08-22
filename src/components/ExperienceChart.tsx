// 선택된 캐릭터들의 날짜별 경험치 증가량을 선 그래프로 표시합니다.
import { ResponsiveContainer, LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";
import type { SeriesPoint } from "../types";
import { formatExp } from "../format";

export type ChartKind = "smooth" | "line" | "bar";

export function seriesForPeriod(series: SeriesPoint[], period: string, completedEnd: string | null | undefined): SeriesPoint[] {
  if (period !== "daily" || !completedEnd) return series;
  return series.filter((point) => point.date > completedEnd);
}

export function seriesColor(characterId: number): string {
  const hue = Math.round((characterId * 137.508 + 24) % 360);
  return `hsl(${hue} 72% 58%)`;
}

export function ExperienceChart({ series, theme, kind }: { series: SeriesPoint[]; theme: "dark" | "light"; kind: ChartKind }) {
  const names = [...new Set(series.map((point) => point.character_name))];
  const characterIds = new Map(series.map((point) => [point.character_name, point.character_id]));
  const map = new Map<string, Record<string, string | number | null>>();
  for (const point of series) {
    const row = map.get(point.date) ?? { date: point.date.slice(5) };
    row[point.character_name] = point.gained_exp;
    map.set(point.date, row);
  }
  const rows = [...map.values()];
  if (!rows.length) return <div className="empty-chart">동기화가 완료되면 날짜별 성장 그래프가 표시됩니다.</div>;
  const gridColor = theme === "light" ? "#d9dee7" : "#272d39";
  const axisColor = theme === "light" ? "#667085" : "#737c8d";
  const tooltipStyle = { color: theme === "light" ? "#1f2937" : "#f2f4f8", background: theme === "light" ? "#ffffff" : "#171b23", border: `1px solid ${theme === "light" ? "#d8dee8" : "#303747"}`, borderRadius: 10 };
  if (kind === "bar") {
    return (
      <ResponsiveContainer width="100%" height={280}>
        <BarChart data={rows} margin={{ top: 10, right: 18, left: 8, bottom: 0 }}>
          <CartesianGrid stroke={gridColor} strokeDasharray="4 5" vertical={false} />
          <XAxis dataKey="date" stroke={axisColor} tickLine={false} axisLine={false} fontSize={14} />
          <YAxis stroke={axisColor} tickLine={false} axisLine={false} fontSize={13} tickFormatter={(value) => formatExp(Number(value))} width={64} />
          <Tooltip contentStyle={tooltipStyle} formatter={(value) => formatExp(Number(value))} />
          {names.map((name) => <Bar key={name} dataKey={name} fill={seriesColor(characterIds.get(name) ?? 0)} radius={[3, 3, 0, 0]} maxBarSize={28} />)}
        </BarChart>
      </ResponsiveContainer>
    );
  }
  return (
    <ResponsiveContainer width="100%" height={280}>
      <LineChart data={rows} margin={{ top: 10, right: 18, left: 8, bottom: 0 }}>
        <CartesianGrid stroke={gridColor} strokeDasharray="4 5" vertical={false} />
        <XAxis dataKey="date" stroke={axisColor} tickLine={false} axisLine={false} fontSize={14} />
        <YAxis stroke={axisColor} tickLine={false} axisLine={false} fontSize={13} tickFormatter={(value) => formatExp(Number(value))} width={64} />
        <Tooltip contentStyle={tooltipStyle} formatter={(value) => formatExp(Number(value))} />
        {names.map((name) => <Line key={name} type={kind === "smooth" ? "monotone" : "linear"} dataKey={name} stroke={seriesColor(characterIds.get(name) ?? 0)} strokeWidth={2.3} dot={kind === "line" ? { r: 2.5 } : false} connectNulls={false} />)}
      </LineChart>
    </ResponsiveContainer>
  );
}
