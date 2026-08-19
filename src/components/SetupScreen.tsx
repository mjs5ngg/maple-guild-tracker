// 최초 API 키와 대표 캐릭터 설정 화면을 제공합니다.
import { FormEvent, useState } from "react";
import { KeyRound, ShieldCheck, Sparkles } from "lucide-react";
import { native } from "../native";
import type { SyncProgress } from "../types";

interface Props {
  progress: SyncProgress | null;
  onComplete: () => Promise<void>;
}

export function SetupScreen({ progress, onComplete }: Props) {
  const [apiKey, setApiKey] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [confirmed, setConfirmed] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const result = await native.setup(apiKey, name);
      setApiKey("");
      setConfirmed(`${result.world_name} · ${result.guild_name} · ${result.character_name}`);
      await native.sync(30);
      await onComplete();
    } catch (reason) {
      setError(String(reason));
    } finally {
      setBusy(false);
    }
  }

  const percent = progress?.total ? Math.round((progress.completed / progress.total) * 100) : 0;

  return (
    <main className="setup-shell">
      <section className="setup-copy">
        <div className="brand-mark"><Sparkles size={25} /></div>
        <p className="eyebrow">MAPLE GUILD TRACKER</p>
        <h1>매일의 성장을<br /><span>한눈에 기록하세요.</span></h1>
        <p className="setup-description">
          길드원 전체의 공식 경험치 기록을 자동으로 모으고,<br />내 캐릭터와의 일간·주간 격차를 비교합니다.
        </p>
        <div className="trust-row">
          <ShieldCheck size={18} />
          <span>API 키는 Windows 자격 증명 관리자에만 저장됩니다.</span>
        </div>
      </section>

      <section className="setup-card">
        <div className="setup-card-heading">
          <KeyRound size={21} />
          <div><h2>처음 시작하기</h2><p>두 가지 정보만 입력하면 됩니다.</p></div>
        </div>
        <form onSubmit={submit}>
          <label>NEXON Open API 키</label>
          <input type="password" value={apiKey} onChange={(event) => setApiKey(event.target.value)} autoComplete="off" placeholder="발급받은 API 키" disabled={busy} />
          <label>대표 캐릭터명</label>
          <input value={name} onChange={(event) => setName(event.target.value)} placeholder="길드에 가입된 캐릭터" disabled={busy} />
          {confirmed && <div className="confirmed">확인됨 · {confirmed}</div>}
          {busy && (
            <div className="sync-box">
              <div className="sync-label"><span>{progress?.message ?? "캐릭터 정보를 확인하고 있습니다."}</span><b>{percent}%</b></div>
              <div className="progress"><span style={{ width: `${percent}%` }} /></div>
              <small>첫 수집은 길드 규모에 따라 시간이 걸릴 수 있습니다.</small>
            </div>
          )}
          {error && <div className="error-banner">{error}</div>}
          <button className="primary-button" disabled={busy || !apiKey.trim() || !name.trim()}>{busy ? "기록을 준비하는 중" : "길드 기록 시작"}</button>
        </form>
        <p className="source-note">Data based on NEXON Open API</p>
      </section>
    </main>
  );
}
