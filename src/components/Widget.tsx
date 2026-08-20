// 항상 위 미니 위젯에서 즐겨찾기와 길드 상위 순위를 전환해 표시합니다.
import { useEffect, useMemo, useState } from "react";
import { ChevronRight, Eye, GripHorizontal, LayoutDashboard, Minus, RefreshCw, Star, Trophy, X } from "lucide-react";
import { getCurrentWindow, LogicalPosition, LogicalSize } from "@tauri-apps/api/window";
import { native } from "../native";
import { formatExp, shortDate } from "../format";
import type { DashboardData } from "../types";
import { CharacterAvatar } from "./CharacterAvatar";

type Mode = "favorites" | "guild";
type Period = "daily" | "7d";

export function Widget() {
  const [mode, setMode] = useState<Mode>(() => (localStorage.getItem("widget-mode") as Mode) || "favorites");
  const [period, setPeriod] = useState<Period>(() => (localStorage.getItem("widget-period") as Period) || "daily");
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [opacity, setOpacity] = useState(() => Number(localStorage.getItem("widget-opacity") || "0.96"));

  async function load() {
    setLoading(true);
    try { setData(await native.dashboard(period)); } finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, [period]);

  useEffect(() => {
    const appWindow = getCurrentWindow();
    const saved = localStorage.getItem("widget-bounds");
    if (saved) {
      const bounds = JSON.parse(saved) as { x: number; y: number; width: number; height: number };
      void appWindow.setPosition(new LogicalPosition(bounds.x, bounds.y));
      void appWindow.setSize(new LogicalSize(bounds.width, bounds.height));
    }
    void native.setWidgetOpacity(opacity);
    let timer: number | undefined;
    const save = async () => {
      globalThis.clearTimeout(timer);
      timer = globalThis.setTimeout(async () => {
        const [position, size, factor] = await Promise.all([appWindow.outerPosition(), appWindow.outerSize(), appWindow.scaleFactor()]);
        localStorage.setItem("widget-bounds", JSON.stringify({ x: position.x / factor, y: position.y / factor, width: size.width / factor, height: size.height / factor }));
      }, 250);
    };
    const unlistenMoved = appWindow.onMoved(save);
    const unlistenResized = appWindow.onResized(save);
    return () => { void unlistenMoved.then((fn) => fn()); void unlistenResized.then((fn) => fn()); };
  }, []);

  function changeMode() {
    const next = mode === "favorites" ? "guild" : "favorites";
    setMode(next); localStorage.setItem("widget-mode", next);
  }
  function changePeriod(next: Period) { setPeriod(next); localStorage.setItem("widget-period", next); }
  function changeOpacity(value: number) { setOpacity(value); localStorage.setItem("widget-opacity", String(value)); void native.setWidgetOpacity(value); }

  const rows = useMemo(() => {
    const source = data?.rankings ?? [];
    return source.filter((row) => mode === "favorites" ? row.is_primary || row.is_favorite : row.is_current_member).slice(0, 8);
  }, [data, mode]);

  return (
    <main className="widget-shell" onDoubleClick={() => native.showDashboard()}>
      <header data-tauri-drag-region>
        <div data-tauri-drag-region><GripHorizontal size={16} /><span>{mode === "favorites" ? "나＋즐겨찾기" : "길드 상위"}</span></div>
        <div><button title="새로고침" onClick={(event) => { event.stopPropagation(); void load(); }}><RefreshCw className={loading ? "spin" : ""} /></button><button title="최소화" onClick={(event) => { event.stopPropagation(); void native.hideWindow(); }}><Minus /></button><button title="닫기" onClick={(event) => { event.stopPropagation(); void native.hideWindow(); }}><X /></button></div>
      </header>
      <section className="widget-title"><div><p>최근 완료일</p><h1>{shortDate(data?.summary.latest_date ?? null)}</h1></div><button className="mode-toggle" onClick={changeMode}>{mode === "favorites" ? <><Trophy />길드 상위<ChevronRight /></> : <><Star />즐겨찾기<ChevronRight /></>}</button></section>
      <div className="widget-tabs"><button className={period === "daily" ? "active" : ""} onClick={() => changePeriod("daily")}>일간</button><button className={period === "7d" ? "active" : ""} onClick={() => changePeriod("7d")}>최근 7일</button></div>
      <section className="widget-list">{rows.map((row, index) => <article key={row.character_id} className={row.is_primary ? "me" : ""}><span className={`mini-rank mini-rank-${index + 1}`}>{index + 1}</span><CharacterAvatar image={row.character_image} name={row.character_name} mini /><div><b>{row.character_name}{row.is_primary && <em>ME</em>}</b><small>Lv.{row.level} · {row.character_class}</small></div><strong>{formatExp(row.gained_exp)}</strong></article>)}{!rows.length && <div className="widget-empty">동기화된 기록이 없습니다.</div>}</section>
      <footer><div className="opacity-control"><Eye size={13} /><input aria-label="투명도" type="range" min="0.65" max="1" step="0.05" value={opacity} onChange={(event) => changeOpacity(Number(event.target.value))} /></div><button onClick={() => native.showDashboard()}><LayoutDashboard />대시보드</button><span>Data based on NEXON Open API</span></footer>
    </main>
  );
}
