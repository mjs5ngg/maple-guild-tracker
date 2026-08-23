// 길드 경험치 요약, 순위, 그래프와 즐겨찾기 관리를 제공합니다.
import { CSSProperties, FormEvent, PointerEvent as ReactPointerEvent, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowUp, BarChart3, CalendarDays, ChevronRight, Crown, ExternalLink, GripVertical, HelpCircle, Image, KeyRound, Moon, RefreshCw, Search, Settings, SlidersHorizontal, Star, Sun, Trophy, Type, Users, X } from "lucide-react";
import { native } from "../native";
import { formatCurrentProgress, formatExp, shortDate, syncTime } from "../format";
import type { AppStatus, DashboardData, SyncProgress } from "../types";
import { ExperienceChart, seriesForPeriod, type ChartKind } from "./ExperienceChart";
import { CharacterAvatar } from "./CharacterAvatar";
import { applyTheme, getStoredTheme, type AppTheme } from "../theme";
import { avatarPhysicalBase, defaultDisplaySettings, getDisplaySettings, saveDisplaySettings } from "../displaySettings";
import { currentGuildRows, favoriteRankingRows, moveFavorite, orderFavorites, sameCharacterOrder, sortByOverallProgress, sortFavoritesByLevel } from "../rankings";
import { ApiKeyHelpModal } from "./ApiKeyHelpModal";
import { useBackDismiss } from "../useBackDismiss";
import { saveDashboardPeriod, saveDashboardRankingMode, storedDashboardPeriod, storedDashboardRankingMode, type DashboardPeriod } from "../dashboardPreferences";

interface Props {
  status: AppStatus;
  progress: SyncProgress | null;
  onRefreshStatus: () => Promise<void>;
}

const periods = [{ key: "daily", label: "일간" }, { key: "7d", label: "최근 7일" }, { key: "30d", label: "최근 30일" }] as const;

function storedChartKind(period: string): ChartKind {
  const value = localStorage.getItem(`chart-kind:${period}`);
  return value === "line" || value === "bar" ? value : "smooth";
}

function periodDisplayName(period: string): string {
  if (period === "daily") return "일간";
  if (period === "7d") return "최근 7일";
  if (period === "30d") return "최근 30일";
  return "지정 기간";
}

const favoriteOrderStorageKey = "favorite-character-order";
const isAndroidRuntime = /Android/i.test(navigator.userAgent);
type DashboardView = "main" | "favorites";

function storedFavoriteOrder(): number[] {
  try {
    const value = JSON.parse(localStorage.getItem(favoriteOrderStorageKey) ?? "[]");
    return Array.isArray(value) ? value.filter((id): id is number => Number.isInteger(id)) : [];
  } catch {
    return [];
  }
}

export function Dashboard({ status, progress, onRefreshStatus }: Props) {
  const [period, setPeriod] = useState<DashboardPeriod>(storedDashboardPeriod);
  const [data, setData] = useState<DashboardData | null>(null);
  const [search, setSearch] = useState("");
  const [externalName, setExternalName] = useState("");
  const [customOpen, setCustomOpen] = useState(false);
  const [customStart, setCustomStart] = useState(() => storedDashboardPeriod().startsWith("custom:") ? storedDashboardPeriod().split(":")[1] : "");
  const [customEnd, setCustomEnd] = useState(() => storedDashboardPeriod().startsWith("custom:") ? storedDashboardPeriod().split(":")[2] : "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [apiHelpOpen, setApiHelpOpen] = useState(false);
  const [newApiKey, setNewApiKey] = useState("");
  const [keyMessage, setKeyMessage] = useState("");
  const [displayOpen, setDisplayOpen] = useState(false);
  const [displayPosition, setDisplayPosition] = useState({ top: 0, left: 0 });
  const displayButtonRef = useRef<HTMLButtonElement>(null);
  const [theme, setTheme] = useState<AppTheme>(getStoredTheme);
  const [uiScale, setUiScale] = useState(() => getDisplaySettings().uiScale);
  const [avatarScale, setAvatarScale] = useState(() => getDisplaySettings().avatarScale);
  const [rankingMode, setRankingMode] = useState(storedDashboardRankingMode);
  const [chartKind, setChartKind] = useState<ChartKind>(() => storedChartKind(storedDashboardPeriod()));
  const [favoriteOrder, setFavoriteOrder] = useState(storedFavoriteOrder);
  const [draggedFavoriteId, setDraggedFavoriteId] = useState<number | null>(null);
  const [favoriteDropTarget, setFavoriteDropTarget] = useState<number | null>(null);
  const [activeView, setActiveView] = useState<DashboardView>("main");
  const favoriteDropTargetRef = useRef<number | null>(null);
  const activityFollowupTimerRef = useRef<number | null>(null);
  const closeCustomPeriod = useBackDismiss(customOpen, () => setCustomOpen(false));
  const closeSettings = useBackDismiss(settingsOpen, () => setSettingsOpen(false));

  async function load() {
    try { setData(await native.dashboard(period)); setError(""); }
    catch (reason) { setError(String(reason)); }
  }
  useEffect(() => { void load(); }, [period]);
  useEffect(() => saveDashboardPeriod(period), [period]);
  useEffect(() => saveDashboardRankingMode(rankingMode), [rankingMode]);
  useEffect(() => setChartKind(storedChartKind(period)), [period]);
  useEffect(() => applyTheme(theme), [theme]);
  useEffect(() => {
    const timer = globalThis.setInterval(() => void load(), 30_000);
    return () => globalThis.clearInterval(timer);
  }, [period]);
  useEffect(() => {
    const refreshAfterResume = () => {
      if (document.visibilityState === "hidden") return;
      void native.liveSync().then(load).then(scheduleActivityFollowup).catch(() => undefined);
    };
    document.addEventListener("visibilitychange", refreshAfterResume);
    return () => document.removeEventListener("visibilitychange", refreshAfterResume);
  }, [period]);
  useEffect(() => () => {
    if (activityFollowupTimerRef.current !== null) globalThis.clearTimeout(activityFollowupTimerRef.current);
  }, []);
  useEffect(() => {
    if (progress?.phase === "complete") void Promise.all([load(), onRefreshStatus()]);
  }, [progress?.phase]);
  useEffect(() => {
    if (data?.summary.latest_date && !customEnd) {
      const end = data.summary.latest_date;
      const startDate = new Date(`${end}T00:00:00Z`);
      startDate.setDate(startDate.getDate() - 6);
      setCustomEnd(end);
      setCustomStart(startDate.toISOString().slice(0, 10));
    }
  }, [data?.summary.latest_date]);
  useEffect(() => {
    if (draggedFavoriteId === null) return;
    const finish = () => {
      setDraggedFavoriteId(null);
      setFavoriteDropTarget(null);
      favoriteDropTargetRef.current = null;
    };
    const move = (event: PointerEvent) => {
      if ((event.buttons & 1) === 0) {
        finish();
        return;
      }
      event.preventDefault();
      const card = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>("[data-favorite-id]");
      const targetId = Number(card?.dataset.favoriteId);
      if (!Number.isInteger(targetId)) return;
      if (targetId === draggedFavoriteId) {
        favoriteDropTargetRef.current = draggedFavoriteId;
        setFavoriteDropTarget(null);
        return;
      }
      if (favoriteDropTargetRef.current === targetId) return;
      favoriteDropTargetRef.current = targetId;
      setFavoriteDropTarget(targetId);
      setFavoriteOrder((currentOrder) => {
        const rows = orderFavorites(data?.rankings.filter((row) => row.is_favorite) ?? [], currentOrder);
        const next = moveFavorite(rows.map((row) => row.character_id), draggedFavoriteId, targetId);
        localStorage.setItem(favoriteOrderStorageKey, JSON.stringify(next));
        return next;
      });
    };
    globalThis.addEventListener("pointermove", move, { passive: false });
    globalThis.addEventListener("pointerup", finish);
    globalThis.addEventListener("pointercancel", finish);
    return () => {
      globalThis.removeEventListener("pointermove", move);
      globalThis.removeEventListener("pointerup", finish);
      globalThis.removeEventListener("pointercancel", finish);
    };
  }, [draggedFavoriteId, data?.rankings]);

  async function sync() {
    setBusy(true); setError("");
    try {
      await native.liveSync();
      await native.sync();
      await native.liveSync();
      await Promise.all([load(), onRefreshStatus()]);
      scheduleActivityFollowup();
    }
    catch (reason) { setError(String(reason)); }
    finally { setBusy(false); }
  }

  function scheduleActivityFollowup() {
    if (activityFollowupTimerRef.current !== null) globalThis.clearTimeout(activityFollowupTimerRef.current);
    activityFollowupTimerRef.current = globalThis.setTimeout(() => {
      activityFollowupTimerRef.current = null;
      void native.liveSync().then(load).catch(() => undefined);
    }, 60_000);
  }

  function showMainSection(sectionId?: string) {
    setActiveView("main");
    requestAnimationFrame(() => requestAnimationFrame(() => {
      if (sectionId) document.getElementById(sectionId)?.scrollIntoView({ behavior: "smooth" });
      else globalThis.scrollTo({ top: 0, behavior: "smooth" });
    }));
  }

  function showFavorites() {
    setActiveView("favorites");
    globalThis.scrollTo({ top: 0, behavior: "smooth" });
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

  async function replaceApiKey(event: FormEvent) {
    event.preventDefault();
    setBusy(true); setError(""); setKeyMessage("");
    try {
      await native.replaceApiKey(newApiKey);
      setNewApiKey("");
      setKeyMessage("새 API 키로 교체했습니다. 창을 닫고 동기화 버튼을 눌러 주세요.");
    } catch (reason) { setError(String(reason)); }
    finally { setBusy(false); }
  }

  async function changePrimary(characterId: number) {
    setBusy(true); setError("");
    try { await native.changePrimary(characterId); await Promise.all([load(), onRefreshStatus()]); }
    catch (reason) { setError(String(reason)); }
    finally { setBusy(false); }
  }

  function changeUiScale(value: number) {
    setUiScale(value);
    saveDisplaySettings({ uiScale: value, avatarScale });
  }

  function changeAvatarScale(value: number) {
    setAvatarScale(value);
    saveDisplaySettings({ uiScale, avatarScale: value });
  }

  function resetDisplaySettings() {
    setUiScale(defaultDisplaySettings.uiScale);
    setAvatarScale(defaultDisplaySettings.avatarScale);
    saveDisplaySettings(defaultDisplaySettings);
  }

  function toggleDisplayControls() {
    if (displayOpen) {
      setDisplayOpen(false);
      return;
    }
    const bounds = displayButtonRef.current?.getBoundingClientRect();
    if (bounds) {
      setDisplayPosition({
        top: bounds.bottom + 7,
        left: Math.max(8, Math.min(globalThis.innerWidth - 263, bounds.right - 255)),
      });
    }
    setDisplayOpen(true);
  }

  function changeChartKind(kind: ChartKind) {
    setChartKind(kind);
    localStorage.setItem(`chart-kind:${period}`, kind);
  }

  function scrollToCharacter(characterId: number) {
    const target = data?.rankings.find((row) => row.character_id === characterId);
    if (!target?.is_current_member) return;
    setSearch("");
    requestAnimationFrame(() => requestAnimationFrame(() => {
      document.getElementById(`character-row-${characterId}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
    }));
  }

  function startFavoriteDrag(event: ReactPointerEvent<HTMLElement>, characterId: number) {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    favoriteDropTargetRef.current = characterId;
    setDraggedFavoriteId(characterId);
  }

  function resetFavoriteOrder() {
    setFavoriteOrder([]);
    localStorage.removeItem(favoriteOrderStorageKey);
  }

  const rankedRows = useMemo(() => {
    const guildRows = currentGuildRows(data?.rankings ?? []);
    const source = rankingMode === "overall" ? sortByOverallProgress(guildRows) : guildRows;
    return source.map((row, index) => ({ row, displayRank: index + 1 }));
  }, [data, rankingMode]);
  const rows = useMemo(() => rankedRows.filter(({ row }) => row.character_name.toLowerCase().includes(search.toLowerCase())), [rankedRows, search]);
  const summary = data?.summary;
  const chartSeries = seriesForPeriod(data?.series ?? [], period, summary?.period_end);
  const favoriteSource = data?.rankings.filter((row) => row.is_favorite) ?? [];
  const defaultFavoriteRows = sortFavoritesByLevel(favoriteSource);
  const favoriteRows = orderFavorites(favoriteSource, favoriteOrder);
  const favoritesAreDefault = sameCharacterOrder(favoriteRows, defaultFavoriteRows);
  const favoriteRankedRows = useMemo(() => {
    const source = favoriteRankingRows(data?.rankings ?? [], rankingMode === "overall");
    return source.map((row, index) => ({ row, displayRank: index + 1 }));
  }, [data, rankingMode]);
  const displayedPrimaryRank = rankedRows.find(({ row }) => row.is_primary)?.displayRank;
  const displayedLeaderGap = rankingMode === "overall" ? rankedRows[0]?.row.gap_from_primary : summary?.leader_gap;
  const progressPercent = progress?.total ? Math.round((progress.completed / progress.total) * 100) : 0;
  const syncVisible = busy || ["guild", "identity", "character", "calculate", "live", "waiting"].includes(progress?.phase ?? "");
  const syncWaiting = progress?.phase === "waiting";

  return (
    <>
    <div className="app-shell" style={{ "--ui-scale": uiScale, "--avatar-scale": avatarScale * avatarPhysicalBase } as CSSProperties}>
      <aside className="sidebar">
        <div className="side-brand"><div className="brand-mark small"><BarChart3 size={20} /></div><div><b>길드원 따라가기</b><span>Guild EXP</span></div></div>
        <nav><button className={activeView === "main" ? "active" : ""} onClick={() => showMainSection()}><BarChart3 />대시보드</button><button onClick={() => showMainSection("history")}><CalendarDays />성장 기록</button><button className={activeView === "favorites" ? "active" : ""} onClick={showFavorites}><Star />즐겨찾기 순위</button><button onClick={() => showMainSection("ranking")}><Users />길드 순위</button></nav>
        <div className="guild-card"><span>현재 추적 길드</span><strong>{status.guild_name}</strong><small>{status.world_name} · 대표 {status.primary_name}</small></div>
        {!isAndroidRuntime && <button className="widget-open" onClick={() => native.showWidget()}><ExternalLink size={16} />미니 위젯 열기</button>}
        <div className="side-source">Data based on<br />NEXON Open API</div>
      </aside>

      <main className="dashboard-main">
        <header className="topbar">
          <div><p className="eyebrow">{activeView === "favorites" ? "FAVORITE RANKING" : "GUILD OVERVIEW"}</p><h1>{activeView === "favorites" ? "즐겨찾기 순위" : "길드 성장 대시보드"}</h1><p>최근 완료일 {summary?.latest_date ?? status.latest_date ?? "동기화 전"} 기준이며, 활동 표시는 공식 API 특성상 평균 15분가량 늦을 수 있습니다.</p></div>
          <div className="top-actions">
            <div className="period-tabs">{periods.map((item) => <button key={item.key} className={period === item.key ? "active" : ""} onClick={() => { setPeriod(item.key); if (customOpen) closeCustomPeriod(); }}>{item.label}</button>)}<button className={period.startsWith("custom:") ? "active" : ""} onClick={() => customOpen ? closeCustomPeriod() : setCustomOpen(true)}>직접 지정</button></div>
            <button className="icon-action" title="API 키 설정" onClick={() => setSettingsOpen(true)}><Settings /></button>
            <button className="icon-action" title={theme === "dark" ? "라이트 테마" : "다크 테마"} onClick={() => setTheme((value) => value === "dark" ? "light" : "dark")}>{theme === "dark" ? <Sun /> : <Moon />}</button>
            {!isAndroidRuntime && <div className="display-control-wrap"><button ref={displayButtonRef} className="icon-action" title="화면 크기 조절" onClick={toggleDisplayControls}><SlidersHorizontal /></button></div>}
            <button className="icon-action" title="동기화" onClick={sync} disabled={busy}><RefreshCw className={busy ? "spin" : ""} /></button>
          </div>
        </header>

        {customOpen && <div className="custom-period"><label>시작일<input type="date" value={customStart} onChange={(event) => setCustomStart(event.target.value)} /></label><span>—</span><label>종료일<input type="date" value={customEnd} onChange={(event) => setCustomEnd(event.target.value)} /></label><button disabled={!customStart || !customEnd || customStart > customEnd} onClick={() => { setPeriod(`custom:${customStart}:${customEnd}`); closeCustomPeriod(); }}>적용</button></div>}

        {syncVisible && <div className="sync-strip"><div><RefreshCw className={syncWaiting ? "" : "spin"} size={15} /><span>{progress?.message ?? "공식 데이터를 동기화하고 있습니다."}</span></div><b>{progressPercent}%</b><i style={{ width: `${progressPercent}%` }} /></div>}
        {error && <div className="error-banner dashboard-error">{error}</div>}

        {activeView === "favorites" ? <section className="panel ranking-panel favorite-ranking-view" id="favorite-ranking">
          <div className="panel-heading ranking-heading"><div><p className="eyebrow">FAVORITE RANKING</p><h2>즐겨찾기 <button className={`ranking-mode-button ${rankingMode === "period" ? "pressed" : ""}`} onClick={() => setRankingMode((value) => value === "overall" ? "period" : "overall")}>{rankingMode === "overall" ? "경험치" : "기간별 경험치"}</button> 순위</h2><small>대표 캐릭터와 길드 밖 캐릭터를 포함한 즐겨찾기만 표시합니다.</small></div><Star size={20} /></div>
          <div className="table-wrap"><table><thead><tr><th>순위</th><th>캐릭터</th><th>레벨</th><th>현재 경험치 · {rankingMode === "period" ? `${periodDisplayName(period)} 동안 획득` : "오늘 획득"}</th><th>나와의 격차</th><th>상태</th><th aria-label="대표 및 즐겨찾기" /></tr></thead><tbody>{favoriteRankedRows.map(({ row, displayRank }) => <tr key={row.character_id} className={row.is_primary ? "primary-row" : ""}><td><span className={`rank rank-${displayRank}`}>{displayRank}</span></td><td><div className="character-cell"><CharacterAvatar image={row.character_image} name={row.character_name} active={row.is_hunting} /><div><b>{row.character_name}{row.is_hunting && " 🔥"}{row.is_primary && <em>나</em>}</b><small>{row.character_class || "직업 확인 중"}{!row.is_current_member && " · 외부"}</small></div></div></td><td>Lv.{row.level || "—"}</td><td className="exp-cell">{formatCurrentProgress(row.current_exp_rate, rankingMode === "period" ? row.gained_exp : row.today_exp)}</td><td className={row.gap_from_primary && row.gap_from_primary > 0 ? "positive" : "muted"}>{formatExp(row.gap_from_primary, true)}</td><td><span className={row.status === "정상" ? "status-ok" : "status-pending"}>{row.status}</span></td><td><div className="row-actions">{row.is_current_member && !row.is_primary && <button className="primary-character-button" title="대표 캐릭터로 지정" onClick={() => void changePrimary(row.character_id)} disabled={busy}><Crown size={16} /></button>}<button className={`star-button ${row.is_favorite ? "selected" : ""}`} title="즐겨찾기 해제" onClick={() => toggleFavorite(row.character_id, row.is_favorite)} disabled={row.is_primary}><Star size={17} fill={row.is_favorite ? "currentColor" : "none"} /></button></div></td></tr>)}</tbody></table>{!favoriteRankedRows.length && <div className="empty-table">즐겨찾기 캐릭터가 없습니다.</div>}</div>
        </section> : <>
        <section className="summary-grid">
          <article><div className="summary-icon orange"><Trophy /></div><span>현재 경험치 · 오늘 획득</span><strong>{formatCurrentProgress(summary?.primary_current_exp_rate, summary?.primary_today_exp)}</strong><small>{status.primary_name} · {period === "daily" ? "오늘 실시간" : `선택 기간 ${formatExp(summary?.primary_period_exp, true)}`}</small></article>
          <article><div className="summary-icon mint"><Crown /></div><span>길드 내 순위</span><strong>{displayedPrimaryRank ? `${displayedPrimaryRank}위` : "—"}</strong><small>{rankingMode === "overall" ? "전체 성장 위치 기준" : "선택 기간 획득량 기준"}</small></article>
          <article><div className="summary-icon blue"><ChevronRight /></div><span>선두와의 격차</span><strong>{formatExp(displayedLeaderGap)}</strong><small>{displayedLeaderGap === 0 ? "현재 공동 선두입니다." : "선두까지 남은 경험치"}</small></article>
          <article><div className="summary-icon violet"><CalendarDays /></div><span>최근 완료일</span><strong>{shortDate(summary?.latest_date ?? null)}</strong><small>{syncTime(summary?.last_sync_at ?? null)}</small></article>
        </section>

        <section className="content-grid">
          <article className="panel chart-panel" id="history"><div className="panel-heading"><div><p className="eyebrow">EXP HISTORY</p><h2>날짜별 성장 흐름</h2></div><div className="chart-heading-actions"><div className="chart-kind-tabs"><button className={chartKind === "smooth" ? "active" : ""} onClick={() => changeChartKind("smooth")}>부드러운 선</button><button className={chartKind === "line" ? "active" : ""} onClick={() => changeChartKind("line")}>꺾은선</button><button className={chartKind === "bar" ? "active" : ""} onClick={() => changeChartKind("bar")}>막대</button></div><span>{period === "daily" ? "오늘" : `${summary?.period_start ?? "—"} — ${summary?.period_end ?? "—"}`}</span></div></div><ExperienceChart series={chartSeries} theme={theme} kind={chartKind} /></article>
          <article className="panel favorites-panel">
            <div className="panel-heading"><div><p className="eyebrow">QUICK ADD</p><div className="favorites-title-row"><h2>즐겨찾기</h2><button className="favorite-sort-button" disabled={favoritesAreDefault} onClick={resetFavoriteOrder}>정렬</button></div></div><Star size={18} /></div>
            <p>길드 밖 캐릭터도 최근 30일 기록과 함께 비교할 수 있습니다.</p>
            <form onSubmit={addExternal}><input value={externalName} onChange={(event) => setExternalName(event.target.value)} placeholder="캐릭터명 입력" disabled={busy} /><button disabled={busy || !externalName.trim()}>추가</button></form>
            <div className={`favorite-list${draggedFavoriteId !== null ? " dragging" : ""}`}>{favoriteRows.slice(0, 5).map((row) => {
              const canScroll = row.is_current_member;
              return <div key={row.character_id} data-favorite-id={row.character_id} className={`favorite-character-card${row.is_primary ? " primary-card" : ""}${canScroll ? " scrollable-card" : ""}${draggedFavoriteId === row.character_id ? " dragging" : ""}${favoriteDropTarget === row.character_id && draggedFavoriteId !== row.character_id ? " drop-target" : ""}`} role={canScroll ? "button" : undefined} tabIndex={canScroll ? 0 : undefined} onClick={canScroll ? () => scrollToCharacter(row.character_id) : undefined} onKeyDown={canScroll ? (event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); scrollToCharacter(row.character_id); } } : undefined}>
                <span className="favorite-drag-handle" role="button" tabIndex={0} title={`${row.character_name} 순서 이동`} aria-label={`${row.character_name} 즐겨찾기 순서 이동`} onClick={(event) => event.stopPropagation()} onPointerDown={(event) => startFavoriteDrag(event, row.character_id)}><GripVertical /></span>
                <CharacterAvatar image={row.character_image} name={row.character_name} active={row.is_hunting} />
                <div><b>{row.character_name}{row.is_hunting && " 🔥"}{row.is_primary && <em className="primary-badge">대표캐릭터</em>}</b><small>Lv.{row.level} · {row.character_class}</small></div>
                <div className="favorite-card-actions"><strong>{formatCurrentProgress(row.current_exp_rate, row.today_exp)}</strong>{!row.is_primary && <button className="star-button selected" title="즐겨찾기 해제" aria-label={`${row.character_name} 즐겨찾기 해제`} onClick={(event) => { event.stopPropagation(); void toggleFavorite(row.character_id, true); }}><Star size={17} fill="currentColor" /></button>}</div>
              </div>;
            })}</div>
          </article>
        </section>

        <section className="panel ranking-panel" id="ranking">
          <div className="panel-heading ranking-heading"><div><p className="eyebrow">GUILD RANKING</p><h2><button className={`ranking-mode-button ${rankingMode === "period" ? "pressed" : ""}`} onClick={() => setRankingMode((value) => value === "overall" ? "period" : "overall")}>{rankingMode === "overall" ? "경험치" : "기간별 경험치"}</button> 순위</h2><small>{rankingMode === "overall" ? "현재 레벨과 현재 경험치 위치 기준 순위입니다." : "선택 기간 획득량 기준 순위입니다."} 격차는 대표 캐릭터와의 현재 성장 위치 차이입니다.</small></div><label className="search-box"><Search size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="길드원 검색" /></label></div>
          <div className="table-wrap"><table><thead><tr><th>순위</th><th>캐릭터</th><th>레벨</th><th>현재 경험치 · {rankingMode === "period" ? `${periodDisplayName(period)} 동안 획득` : "오늘 획득"}</th><th>나와의 격차</th><th>상태</th><th aria-label="대표 및 즐겨찾기" /></tr></thead><tbody>{rows.map(({ row, displayRank }) => <tr id={`character-row-${row.character_id}`} key={row.character_id} className={row.is_primary ? "primary-row" : ""}><td><span className={`rank rank-${displayRank}`}>{displayRank}</span></td><td><div className="character-cell"><CharacterAvatar image={row.character_image} name={row.character_name} active={row.is_hunting} /><div><b>{row.character_name}{row.is_hunting && " 🔥"}{row.is_primary && <em>나</em>}</b><small>{row.character_class || "직업 확인 중"}{!row.is_current_member && " · 외부"}</small></div></div></td><td>Lv.{row.level || "—"}</td><td className="exp-cell">{formatCurrentProgress(row.current_exp_rate, rankingMode === "period" ? row.gained_exp : row.today_exp)}</td><td className={row.gap_from_primary && row.gap_from_primary > 0 ? "positive" : "muted"}>{formatExp(row.gap_from_primary, true)}</td><td><span className={row.status === "정상" ? "status-ok" : "status-pending"}>{row.status}</span></td><td><div className="row-actions">{row.is_current_member && !row.is_primary && <button className="primary-character-button" title="대표 캐릭터로 지정" onClick={() => void changePrimary(row.character_id)} disabled={busy}><Crown size={16} /></button>}<button className={`star-button ${row.is_favorite ? "selected" : ""}`} title="즐겨찾기" onClick={() => toggleFavorite(row.character_id, row.is_favorite)} disabled={row.is_primary}><Star size={17} fill={row.is_favorite ? "currentColor" : "none"} /></button></div></td></tr>)}</tbody></table>{!rows.length && <div className="empty-table">표시할 캐릭터 기록이 없습니다.</div>}</div>
        </section>
        </>}
      </main>
      <nav className="mobile-nav"><button className={activeView === "main" ? "active" : ""} onClick={() => showMainSection()}><BarChart3 />대시보드</button><button onClick={() => showMainSection("history")}><CalendarDays />성장 기록</button><button className={activeView === "favorites" ? "active" : ""} onClick={showFavorites}><Star />즐겨찾기</button><button onClick={() => showMainSection("ranking")}><Users />길드 순위</button></nav>
      {settingsOpen && <div className="modal-backdrop" onMouseDown={closeSettings}><section className="settings-modal" onMouseDown={(event) => event.stopPropagation()}><button className="settings-help-trigger" title="서비스 API 키 발급 도움말" aria-label="서비스 API 키 발급 도움말" onClick={() => setApiHelpOpen(true)}><HelpCircle /></button><button className="modal-close" onClick={closeSettings} aria-label="닫기"><X /></button><div className="settings-icon"><KeyRound /></div><h2>NEXON API 키 변경</h2><p>새 키로 대표 캐릭터 조회가 성공한 경우에만 기존 키를 교체합니다.</p><form onSubmit={replaceApiKey}><label>새 API 키</label><input type="password" value={newApiKey} onChange={(event) => setNewApiKey(event.target.value)} autoComplete="off" placeholder="서비스 단계 API 키" disabled={busy} /><button className="primary-button" disabled={busy || !newApiKey.trim()}>{busy ? "키를 확인하는 중" : "새 키로 교체"}</button></form>{keyMessage && <div className="confirmed">{keyMessage}</div>}{error && <div className="error-banner">{error}</div>}<small>키는 파일이나 SQLite가 아닌 운영체제 보안 저장소에 저장됩니다.</small></section></div>}
      {apiHelpOpen && <ApiKeyHelpModal onClose={() => setApiHelpOpen(false)} />}
    </div>
    <button className="scroll-to-top" title="화면 최상단으로 이동" aria-label="화면 최상단으로 이동" onClick={() => globalThis.scrollTo({ top: 0, behavior: "smooth" })}><ArrowUp /></button>
    {displayOpen && createPortal(<div className="display-controls display-controls-fixed" style={displayPosition}><label><Type />전체 크기 <b>{Math.round(uiScale * 100)}%</b><input type="range" min="1" max="1.4" step="0.02" value={uiScale} onChange={(event) => changeUiScale(Number(event.target.value))} /></label><label><Image />캐릭터 이미지 <b>{Math.round(avatarScale * 100)}%</b><input type="range" min="0.65" max="1.5" step="0.05" value={avatarScale} onChange={(event) => changeAvatarScale(Number(event.target.value))} /></label><button onClick={resetDisplaySettings}>기본값</button></div>, document.body)}
    </>
  );
}
