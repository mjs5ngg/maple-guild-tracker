// 선택된 캐릭터들의 날짜별 경험치 증가량을 선 그래프로 표시합니다.
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";
import type { SeriesPoint } from "../types";
import { formatExp } from "../format";

const colors = ["#ff9b52", "#64d7b3", "#7ea8ff", "#d29cff", "#ff718b", "#f4d35e", "#61c7e8", "#b7e46c"];

export function ExperienceChart({ series }: { series: SeriesPoint[] }) {
  const names = [...new Set(series.map((point) => point.character_name))];
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
        <CartesianGrid stroke="#272d39" strokeDasharray="4 5" vertical={false} />
        <XAxis dataKey="date" stroke="#737c8d" tickLine={false} axisLine={false} fontSize={12} />
        <YAxis stroke="#737c8d" tickLine={false} axisLine={false} fontSize={11} tickFormatter={(value) => formatExp(Number(value))} width={58} />
        <Tooltip contentStyle={{ background: "#171b23", border: "1px solid #303747", borderRadius: 10 }} formatter={(value) => formatExp(Number(value))} />
        {names.map((name, index) => <Line key={name} type="monotone" dataKey={name} stroke={colors[index % colors.length]} strokeWidth={2.3} dot={false} connectNulls={false} />)}
      </LineChart>
    </ResponsiveContainer>
  );
}
