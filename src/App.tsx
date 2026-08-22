// 앱 상태를 읽어 최초 설정 또는 메인 대시보드를 렌더링합니다.
import { useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { native } from "./native";
import type { AppStatus, SyncProgress } from "./types";
import { SetupScreen } from "./components/SetupScreen";
import { Dashboard } from "./components/Dashboard";
import { applyTheme, getStoredTheme } from "./theme";

export default function App() {
  const [status, setStatus] = useState<AppStatus | null>(null);
  const [progress, setProgress] = useState<SyncProgress | null>(null);
  const [fatal, setFatal] = useState("");

  async function loadStatus() {
    try { setStatus(await native.status()); setFatal(""); }
    catch (reason) { setFatal(String(reason)); }
  }
  useEffect(() => {
    applyTheme(getStoredTheme());
    void loadStatus();
    const unlisten = listen<SyncProgress>("sync-progress", (event) => setProgress(event.payload));
    return () => { void unlisten.then((fn) => fn()); };
  }, []);

  if (fatal) return <main className="fatal-screen"><h1>앱을 시작하지 못했습니다.</h1><p>{fatal}</p><button onClick={() => location.reload()}>다시 시도</button></main>;
  if (!status) return <main className="loading-screen"><span /><p>로컬 기록을 불러오고 있습니다.</p></main>;
  return status.configured
    ? <Dashboard status={status} progress={progress} onRefreshStatus={loadStatus} />
    : <SetupScreen progress={progress} onComplete={loadStatus} />;
}
