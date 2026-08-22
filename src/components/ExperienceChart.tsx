// 선택된 캐릭터들의 날짜별 경험치 증가량을 선 그래프로 표시합니다.
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";
import type { SeriesPoint } from "../types";
import { formatExp } from "../format";

export function seriesColor(characterId: number): string {
  const hue = Math.round((characterId * 137.508 + 24) % 360);
  return `hsl(${hue} 72% 58%)`;
}

export function ExperienceChart({ series, theme }: { series: SeriesPoint[]; theme: "dark" | "light" }) {
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
  return (
    <ResponsiveContainer width="100%" height={280}>
      <LineChart data={rows} margin={{ top: 10, right: 18, left: 8, bottom: 0 }}>
        <CartesianGrid stroke={theme === "light" ? "#d9dee7" : "#272d39"} strokeDasharray="4 5" vertical={false} />
        <XAxis dataKey="date" stroke={theme === "light" ? "#667085" : "#737c8d"} tickLine={false} axisLine={false} fontSize={14} />
        <YAxis stroke={theme === "light" ? "#667085" : "#737c8d"} tickLine={false} axisLine={false} fontSize={13} tickFormatter={(value) => formatExp(Number(value))} width={64} />
        <Tooltip contentStyle={{ color: theme === "light" ? "#1f2937" : "#f2f4f8", background: theme === "light" ? "#ffffff" : "#171b23", border: `1px solid ${theme === "light" ? "#d8dee8" : "#303747"}`, borderRadius: 10 }} formatter={(value) => formatExp(Number(value))} />
        {names.map((name) => <Line key={name} type="monotone" dataKey={name} stroke={seriesColor(characterIds.get(name) ?? 0)} strokeWidth={2.3} dot={false} connectNulls={false} />)}
      </LineChart>
    </ResponsiveContainer>
  );
}
