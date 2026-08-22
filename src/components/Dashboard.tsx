// 길드 경험치 요약, 순위, 그래프와 즐겨찾기 관리를 제공합니다.
import { CSSProperties, FormEvent, useEffect, useMemo, useState } from "react";
import { BarChart3, CalendarDays, ChevronRight, Crown, ExternalLink, Image, KeyRound, Moon, RefreshCw, Search, Settings, SlidersHorizontal, Star, Sun, Trophy, Type, Users, X } from "lucide-react";
import { native } from "../native";
import { formatCurrentProgress, formatExp, shortDate, syncTime } from "../format";
import type { AppStatus, DashboardData, SyncProgress } from "../types";
import { ExperienceChart } from "./ExperienceChart";
import { CharacterAvatar } from "./CharacterAvatar";
import { applyTheme, getStoredTheme, type AppTheme } from "../theme";

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
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [newApiKey, setNewApiKey] = useState("");
  const [keyMessage, setKeyMessage] = useState("");
  const [displayOpen, setDisplayOpen] = useState(false);
  const [theme, setTheme] = useState<AppTheme>(getStoredTheme);
  const [uiScale, setUiScale] = useState(() => Number(localStorage.getItem("ui-scale-v2") || "1.10"));
  const [avatarScale, setAvatarScale] = useState(() => Number(localStorage.getItem("avatar-scale-v2") || "1.15"));

  async function load() {
    try { setData(await native.dashboard(period)); setError(""); }
    catch (reason) { setError(String(reason)); }
  }
  useEffect(() => { void load(); }, [period]);
  useEffect(() => applyTheme(theme), [theme]);
  useEffect(() => {
    const timer = globalThis.setInterval(() => void load(), 30_000);
    return () => globalThis.clearInterval(timer);
  }, [period]);
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

  async function sync() {
    setBusy(true); setError("");
    try { await native.sync(); await native.liveSync(); await Promise.all([load(), onRefreshStatus()]); }
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

  function changeUiScale(value: number) { setUiScale(value); localStorage.setItem("ui-scale-v2", String(value)); }
  function changeAvatarScale(value: number) { setAvatarScale(value); localStorage.setItem("avatar-scale-v2", String(value)); }

  function scrollToCharacter(characterId: number) {
    const target = data?.rankings.find((row) => row.character_id === characterId);
    if (!target?.is_current_member) return;
    setSearch("");
    requestAnimationFrame(() => requestAnimationFrame(() => {
      document.getElementById(`character-row-${characterId}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
    }));
  }

  const rows = useMemo(() => data?.rankings.filter((row) => row.character_name.toLowerCase().includes(search.toLowerCase())) ?? [], [data, search]);
  const summary = data?.summary;
  const progressPercent = progress?.total ? Math.round((progress.completed / progress.total) * 100) : 0;
  const syncVisible = busy || ["guild", "identity", "character", "calculate", "live", "waiting"].includes(progress?.phase ?? "");
  const syncWaiting = progress?.phase === "waiting";

  return (
    <div className="app-shell" style={{ "--ui-scale": uiScale, "--avatar-scale": avatarScale } as CSSProperties}>
      <aside className="sidebar">
        <div className="side-brand"><div className="brand-mark small"><BarChart3 size={20} /></div><div><b>길드원 따라가기</b><span>Guild EXP</span></div></div>
        <nav><button className="active"><BarChart3 />대시보드</button><button onClick={() => document.getElementById("ranking")?.scrollIntoView({ behavior: "smooth" })}><Users />길드 순위</button><button onClick={() => document.getElementById("history")?.scrollIntoView({ behavior: "smooth" })}><CalendarDays />성장 기록</button></nav>
        <div className="guild-card"><span>현재 추적 길드</span><strong>{status.guild_name}</strong><small>{status.world_name} · 대표 {status.primary_name}</small></div>
        <button className="widget-open" onClick={() => native.showWidget()}><ExternalLink size={16} />미니 위젯 열기</button>
        <div className="side-source">Data based on<br />NEXON Open API</div>
      </aside>

      <main className="dashboard-main">
        <header className="topbar">
          <div><p className="eyebrow">GUILD OVERVIEW</p><h1>길드 성장 대시보드</h1><p>최근 완료일 {summary?.latest_date ?? status.latest_date ?? "동기화 전"} 기준이며, 활동 표시는 공식 API 특성상 평균 15분가량 늦을 수 있습니다.</p></div>
          <div className="top-actions">
            <div className="period-tabs">{periods.map((item) => <button key={item.key} className={period === item.key ? "active" : ""} onClick={() => { setPeriod(item.key); setCustomOpen(false); }}>{item.label}</button>)}<button className={period.startsWith("custom:") ? "active" : ""} onClick={() => setCustomOpen((value) => !value)}>직접 지정</button></div>
            <button className="icon-action" title="API 키 설정" onClick={() => setSettingsOpen(true)}><Settings /></button>
            <button className="icon-action" title={theme === "dark" ? "라이트 테마" : "다크 테마"} onClick={() => setTheme((value) => value === "dark" ? "light" : "dark")}>{theme === "dark" ? <Sun /> : <Moon />}</button>
            <div className="display-control-wrap"><button className="icon-action" title="화면 크기 조절" onClick={() => setDisplayOpen((value) => !value)}><SlidersHorizontal /></button>{displayOpen && <div className="display-controls"><label><Type />전체 크기 <b>{Math.round(uiScale * 100)}%</b><input type="range" min="1" max="1.4" step="0.02" value={uiScale} onChange={(event) => changeUiScale(Number(event.target.value))} /></label><label><Image />캐릭터 이미지 <b>{Math.round(avatarScale * 100)}%</b><input type="range" min="0.95" max="2.25" step="0.05" value={avatarScale} onChange={(event) => changeAvatarScale(Number(event.target.value))} /></label><button onClick={() => { changeUiScale(1.10); changeAvatarScale(1.15); }}>기본값</button></div>}</div>
            <button className="icon-action" title="동기화" onClick={sync} disabled={busy}><RefreshCw className={busy ? "spin" : ""} /></button>
          </div>
        </header>

        {customOpen && <div className="custom-period"><label>시작일<input type="date" value={customStart} onChange={(event) => setCustomStart(event.target.value)} /></label><span>—</span><label>종료일<input type="date" value={customEnd} onChange={(event) => setCustomEnd(event.target.value)} /></label><button disabled={!customStart || !customEnd || customStart > customEnd} onClick={() => { setPeriod(`custom:${customStart}:${customEnd}`); setCustomOpen(false); }}>적용</button></div>}

        {syncVisible && <div className="sync-strip"><div><RefreshCw className={syncWaiting ? "" : "spin"} size={15} /><span>{progress?.message ?? "공식 데이터를 동기화하고 있습니다."}</span></div><b>{progressPercent}%</b><i style={{ width: `${progressPercent}%` }} /></div>}
        {error && <div className="error-banner dashboard-error">{error}</div>}

        <section className="summary-grid">
          <article><div className="summary-icon orange"><Trophy /></div><span>현재 경험치 · 오늘 획득</span><strong>{formatCurrentProgress(summary?.primary_current_exp_rate, summary?.primary_today_exp)}</strong><small>{status.primary_name} · 선택 기간 {formatExp(summary?.primary_period_exp, true)}</small></article>
          <article><div className="summary-icon mint"><Crown /></div><span>길드 내 순위</span><strong>{summary?.primary_rank ? `${summary.primary_rank}위` : "—"}</strong><small>현재 길드원 기준</small></article>
          <article><div className="summary-icon blue"><ChevronRight /></div><span>선두와의 격차</span><strong>{formatExp(summary?.leader_gap)}</strong><small>{summary?.leader_gap === 0 ? "현재 공동 선두입니다." : "선두까지 남은 경험치"}</small></article>
          <article><div className="summary-icon violet"><CalendarDays /></div><span>최근 완료일</span><strong>{shortDate(summary?.latest_date ?? null)}</strong><small>{syncTime(summary?.last_sync_at ?? null)}</small></article>
        </section>

        <section className="content-grid">
          <article className="panel chart-panel" id="history"><div className="panel-heading"><div><p className="eyebrow">EXP HISTORY</p><h2>날짜별 성장 흐름</h2></div><span>{summary?.period_start ?? "—"} — {summary?.period_end ?? "—"}</span></div><ExperienceChart series={data?.series ?? []} theme={theme} /></article>
          <article className="panel favorites-panel">
            <div className="panel-heading"><div><p className="eyebrow">QUICK ADD</p><h2>즐겨찾기</h2></div><Star size={18} /></div>
            <p>길드 밖 캐릭터도 최근 30일 기록과 함께 비교할 수 있습니다.</p>
            <form onSubmit={addExternal}><input value={externalName} onChange={(event) => setExternalName(event.target.value)} placeholder="캐릭터명 입력" disabled={busy} /><button disabled={busy || !externalName.trim()}>추가</button></form>
            <div className="favorite-list">{data?.rankings.filter((row) => row.is_favorite).slice(0, 5).map((row) => {
              const canScroll = row.is_current_member;
              return <div key={row.character_id} className={`favorite-character-card${row.is_primary ? " primary-card" : ""}${canScroll ? " scrollable-card" : ""}`} role={canScroll ? "button" : undefined} tabIndex={canScroll ? 0 : undefined} onClick={canScroll ? () => scrollToCharacter(row.character_id) : undefined} onKeyDown={canScroll ? (event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); scrollToCharacter(row.character_id); } } : undefined}>
                <CharacterAvatar image={row.character_image} name={row.character_name} active={row.is_hunting} />
                <div><b>{row.character_name}{row.is_hunting && " 🔥"}{row.is_primary && <em className="primary-badge">대표캐릭터</em>}</b><small>Lv.{row.level} · {row.character_class}</small></div>
                <div className="favorite-card-actions"><strong>{formatCurrentProgress(row.current_exp_rate, row.today_exp)}</strong>{!row.is_primary && <button className="star-button selected" title="즐겨찾기 해제" aria-label={`${row.character_name} 즐겨찾기 해제`} onClick={(event) => { event.stopPropagation(); void toggleFavorite(row.character_id, true); }}><Star size={17} fill="currentColor" /></button>}</div>
              </div>;
            })}</div>
          </article>
        </section>

        <section className="panel ranking-panel" id="ranking">
          <div className="panel-heading ranking-heading"><div><p className="eyebrow">GUILD RANKING</p><h2>경험치 순위</h2><small>순위는 선택 기간 획득량, 격차는 대표 캐릭터와의 현재 레벨·경험치 위치 차이입니다.</small></div><label className="search-box"><Search size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="길드원 검색" /></label></div>
          <div className="table-wrap"><table><thead><tr><th>순위</th><th>캐릭터</th><th>레벨</th><th>현재 경험치 · 오늘 획득</th><th>나와의 격차</th><th>상태</th><th aria-label="대표 및 즐겨찾기" /></tr></thead><tbody>{rows.map((row) => <tr id={`character-row-${row.character_id}`} key={row.character_id} className={row.is_primary ? "primary-row" : ""}><td><span className={`rank rank-${row.rank}`}>{row.rank}</span></td><td><div className="character-cell"><CharacterAvatar image={row.character_image} name={row.character_name} active={row.is_hunting} /><div><b>{row.character_name}{row.is_hunting && " 🔥"}{row.is_primary && <em>나</em>}</b><small>{row.character_class || "직업 확인 중"}{!row.is_current_member && " · 외부"}</small></div></div></td><td>Lv.{row.level || "—"}</td><td className="exp-cell">{formatCurrentProgress(row.current_exp_rate, row.today_exp)}</td><td className={row.gap_from_primary && row.gap_from_primary > 0 ? "positive" : "muted"}>{formatExp(row.gap_from_primary, true)}</td><td><span className={row.status === "정상" ? "status-ok" : "status-pending"}>{row.status}</span></td><td><div className="row-actions">{row.is_current_member && !row.is_primary && <button className="primary-character-button" title="대표 캐릭터로 지정" onClick={() => void changePrimary(row.character_id)} disabled={busy}><Crown size={16} /></button>}<button className={`star-button ${row.is_favorite ? "selected" : ""}`} title="즐겨찾기" onClick={() => toggleFavorite(row.character_id, row.is_favorite)} disabled={row.is_primary}><Star size={17} fill={row.is_favorite ? "currentColor" : "none"} /></button></div></td></tr>)}</tbody></table>{!rows.length && <div className="empty-table">표시할 캐릭터 기록이 없습니다.</div>}</div>
        </section>
      </main>
      {settingsOpen && <div className="modal-backdrop" onMouseDown={() => setSettingsOpen(false)}><section className="settings-modal" onMouseDown={(event) => event.stopPropagation()}><button className="modal-close" onClick={() => setSettingsOpen(false)} aria-label="닫기"><X /></button><div className="settings-icon"><KeyRound /></div><h2>NEXON API 키 변경</h2><p>새 키로 대표 캐릭터 조회가 성공한 경우에만 기존 키를 교체합니다.</p><form onSubmit={replaceApiKey}><label>새 API 키</label><input type="password" value={newApiKey} onChange={(event) => setNewApiKey(event.target.value)} autoComplete="off" placeholder="서비스 단계 API 키" disabled={busy} /><button className="primary-button" disabled={busy || !newApiKey.trim()}>{busy ? "키를 확인하는 중" : "새 키로 교체"}</button></form>{keyMessage && <div className="confirmed">{keyMessage}</div>}{error && <div className="error-banner">{error}</div>}<small>키는 파일이나 SQLite가 아닌 Windows 자격 증명 관리자에 저장됩니다.</small></section></div>}
    </div>
  );
}
