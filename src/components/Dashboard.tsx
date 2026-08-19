// 길드 경험치 요약, 순위, 그래프와 즐겨찾기 관리를 제공합니다.
import { FormEvent, useEffect, useMemo, useState } from "react";
import { BarChart3, CalendarDays, ChevronRight, Crown, ExternalLink, RefreshCw, Search, Star, Trophy, Users } from "lucide-react";
import { native } from "../native";
import { formatExp, shortDate, syncTime } from "../format";
import type { AppStatus, DashboardData, SyncProgress } from "../types";
import { ExperienceChart } from "./ExperienceChart";

interface Props {
  status: AppStatus;
  progress: SyncProgress | null;
  onRefreshStatus: () => Promise<void>;
}

const periods = [{ key: "daily", label: "일간" }, { key: "7d", label: "최근 7일" }, { key: "30d", label: "최근 30일" }];

export function Dashboard({ status, progress, onRefreshStatus }: Props) {
  const [period, setPeriod] = useState("7d");
  const [data, setData] = useState<DashboardData | null>(null);
  const [search, setSearch] = useState("");
  const [externalName, setExternalName] = useState("");
  const [customOpen, setCustomOpen] = useState(false);
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function load() {
    try { setData(await native.dashboard(period)); setError(""); }
    catch (reason) { setError(String(reason)); }
  }
  useEffect(() => { void load(); }, [period]);
  useEffect(() => {
    if (data?.summary.latest_date && !customEnd) {
      const end = data.summary.latest_date;
      const startDate = new Date(`${end}T00:00:00Z`);
      startDate.setDate(startDate.getDate() - 6);
      setCustomEnd(end);
      setCustomStart(startDate.toISOString().slice(0, 10));
    }
  }, [data?.summary.latest_date]);

  async function sync() {
    setBusy(true); setError("");
    try { await native.sync(); await Promise.all([load(), onRefreshStatus()]); }
    catch (reason) { setError(String(reason)); }
    finally { setBusy(false); }
  }

  async function addExternal(event: FormEvent) {
    event.preventDefault();
    if (!externalName.trim()) return;
    setBusy(true); setError("");
    try { await native.addExternal(externalName); setExternalName(""); await load(); }
    catch (reason) { setError(String(reason)); }
    finally { setBusy(false); }
  }

  async function toggleFavorite(id: number, current: boolean) {
    await native.favorite(id, !current);
    await load();
  }

  const rows = useMemo(() => data?.rankings.filter((row) => row.character_name.toLowerCase().includes(search.toLowerCase())) ?? [], [data, search]);
  const summary = data?.summary;
  const progressPercent = progress?.total ? Math.round((progress.completed / progress.total) * 100) : 0;

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="side-brand"><div className="brand-mark small"><BarChart3 size={20} /></div><div><b>Maple Track</b><span>Guild EXP</span></div></div>
        <nav><button className="active"><BarChart3 />대시보드</button><button onClick={() => document.getElementById("ranking")?.scrollIntoView({ behavior: "smooth" })}><Users />길드 순위</button><button onClick={() => document.getElementById("history")?.scrollIntoView({ behavior: "smooth" })}><CalendarDays />성장 기록</button></nav>
        <div className="guild-card"><span>현재 추적 길드</span><strong>{status.guild_name}</strong><small>{status.world_name} · 대표 {status.primary_name}</small></div>
        <button className="widget-open" onClick={() => native.showWidget()}><ExternalLink size={16} />미니 위젯 열기</button>
        <div className="side-source">Data based on<br />NEXON Open API</div>
      </aside>

      <main className="dashboard-main">
        <header className="topbar">
          <div><p className="eyebrow">GUILD OVERVIEW</p><h1>길드 성장 대시보드</h1><p>최근 완료일 {summary?.latest_date ?? status.latest_date ?? "동기화 전"} 기준입니다.</p></div>
          <div className="top-actions">
            <div className="period-tabs">{periods.map((item) => <button key={item.key} className={period === item.key ? "active" : ""} onClick={() => { setPeriod(item.key); setCustomOpen(false); }}>{item.label}</button>)}<button className={period.startsWith("custom:") ? "active" : ""} onClick={() => setCustomOpen((value) => !value)}>직접 지정</button></div>
            <button className="icon-action" title="동기화" onClick={sync} disabled={busy}><RefreshCw className={busy ? "spin" : ""} /></button>
          </div>
        </header>

        {customOpen && <div className="custom-period"><label>시작일<input type="date" value={customStart} onChange={(event) => setCustomStart(event.target.value)} /></label><span>—</span><label>종료일<input type="date" value={customEnd} onChange={(event) => setCustomEnd(event.target.value)} /></label><button disabled={!customStart || !customEnd || customStart > customEnd} onClick={() => { setPeriod(`custom:${customStart}:${customEnd}`); setCustomOpen(false); }}>적용</button></div>}

        {(busy || progress?.phase === "character" || progress?.phase === "guild") && <div className="sync-strip"><div><RefreshCw className="spin" size={15} /><span>{progress?.message ?? "공식 데이터를 동기화하고 있습니다."}</span></div><b>{progressPercent}%</b><i style={{ width: `${progressPercent}%` }} /></div>}
        {error && <div className="error-banner dashboard-error">{error}</div>}

        <section className="summary-grid">
          <article><div className="summary-icon orange"><Trophy /></div><span>{period === "daily" ? "일간 획득 경험치" : "선택 기간 경험치"}</span><strong>{formatExp(summary?.primary_period_exp)}</strong><small>{status.primary_name}의 공식 API 기록</small></article>
          <article><div className="summary-icon mint"><Crown /></div><span>길드 내 순위</span><strong>{summary?.primary_rank ? `${summary.primary_rank}위` : "—"}</strong><small>현재 길드원 기준</small></article>
          <article><div className="summary-icon blue"><ChevronRight /></div><span>선두와의 격차</span><strong>{formatExp(summary?.leader_gap)}</strong><small>{summary?.leader_gap === 0 ? "현재 공동 선두입니다." : "선두까지 남은 경험치"}</small></article>
          <article><div className="summary-icon violet"><CalendarDays /></div><span>최근 완료일</span><strong>{shortDate(summary?.latest_date ?? null)}</strong><small>{syncTime(summary?.last_sync_at ?? null)}</small></article>
        </section>

        <section className="content-grid">
          <article className="panel chart-panel" id="history"><div className="panel-heading"><div><p className="eyebrow">EXP HISTORY</p><h2>날짜별 성장 흐름</h2></div><span>{summary?.period_start ?? "—"} — {summary?.period_end ?? "—"}</span></div><ExperienceChart series={data?.series ?? []} /></article>
          <article className="panel favorites-panel"><div className="panel-heading"><div><p className="eyebrow">QUICK ADD</p><h2>외부 즐겨찾기</h2></div><Star size={18} /></div><p>길드 밖 캐릭터도 최근 30일 기록과 함께 비교할 수 있습니다.</p><form onSubmit={addExternal}><input value={externalName} onChange={(event) => setExternalName(event.target.value)} placeholder="캐릭터명 입력" disabled={busy} /><button disabled={busy || !externalName.trim()}>추가</button></form><div className="favorite-list">{data?.rankings.filter((row) => row.is_favorite).slice(0, 5).map((row) => <div key={row.character_id}><span className="avatar">{row.character_name.slice(0, 1)}</span><div><b>{row.character_name}</b><small>Lv.{row.level} · {row.character_class}</small></div><strong>{formatExp(row.gained_exp)}</strong></div>)}</div></article>
        </section>

        <section className="panel ranking-panel" id="ranking">
          <div className="panel-heading ranking-heading"><div><p className="eyebrow">GUILD RANKING</p><h2>경험치 순위</h2></div><label className="search-box"><Search size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="길드원 검색" /></label></div>
          <div className="table-wrap"><table><thead><tr><th>순위</th><th>캐릭터</th><th>레벨</th><th>획득 경험치</th><th>나와의 격차</th><th>상태</th><th aria-label="즐겨찾기" /></tr></thead><tbody>{rows.map((row) => <tr key={row.character_id} className={row.is_primary ? "primary-row" : ""}><td><span className={`rank rank-${row.rank}`}>{row.rank}</span></td><td><div className="character-cell"><span className="avatar">{row.character_name.slice(0, 1)}</span><div><b>{row.character_name}{row.is_primary && <em>나</em>}</b><small>{row.character_class || "직업 확인 중"}{!row.is_current_member && " · 외부"}</small></div></div></td><td>Lv.{row.level || "—"}</td><td className="exp-cell">{formatExp(row.gained_exp)}</td><td className={row.gap_from_primary && row.gap_from_primary > 0 ? "positive" : "muted"}>{formatExp(row.gap_from_primary, true)}</td><td><span className={row.status === "정상" ? "status-ok" : "status-pending"}>{row.status}</span></td><td><button className={`star-button ${row.is_favorite ? "selected" : ""}`} onClick={() => toggleFavorite(row.character_id, row.is_favorite)} disabled={row.is_primary}><Star size={17} fill={row.is_favorite ? "currentColor" : "none"} /></button></td></tr>)}</tbody></table>{!rows.length && <div className="empty-table">표시할 캐릭터 기록이 없습니다.</div>}</div>
        </section>
      </main>
    </div>
  );
}
