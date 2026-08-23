// NEXON 서비스 단계 API 키 발급 절차와 복사용 등록 문구를 안내합니다.
import { CheckCircle2, Copy, HelpCircle, ShieldAlert, X } from "lucide-react";
import { useState } from "react";

const nexonOpenApiUrl = "https://openapi.nexon.com/ko/";
const fields = [
  { id: "name", label: "서비스명", value: "길드원 따라가기" },
  { id: "environment", label: "개발 환경", value: "Windows 10·11 x64 및 Android 7.0 이상 애플리케이션 (Tauri 2)" },
  { id: "url", label: "서비스 URL", value: "https://github.com/mjs5ngg/maple-guild-tracker" },
  { id: "introduction", label: "서비스 소개", value: "길드원 따라가기는 NEXON Open API를 이용해 메이플스토리 길드원과 즐겨찾기 캐릭터의 레벨 및 경험치 변화를 기기에서 기록·비교하는 Windows 및 Android 앱입니다." },
  { id: "purpose", label: "API 활용 목적", value: "메이플스토리 캐릭터 기본 정보와 길드원 목록을 조회하여 일간 경험치 변화, 기간별 순위, 성장 그래프 및 미니 위젯을 제공하는 데 사용합니다." },
] as const;

export function ApiKeyHelpModal({ onClose }: { onClose: () => void }) {
  const [copied, setCopied] = useState("");
  const [error, setError] = useState("");

  async function copyText(id: string, value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(id);
      setError("");
      globalThis.setTimeout(() => setCopied((current) => current === id ? "" : current), 1_500);
    } catch {
      setError("클립보드에 복사하지 못했습니다. 문구를 직접 선택해 복사해 주세요.");
    }
  }

  return (
    <div className="modal-backdrop api-help-backdrop" onMouseDown={onClose}>
      <section className="api-help-modal" onMouseDown={(event) => event.stopPropagation()}>
        <button className="modal-close" onClick={onClose} aria-label="닫기"><X /></button>
        <div className="api-help-heading"><span><HelpCircle /></span><div><p className="eyebrow">SERVICE API KEY</p><h2>서비스용 API 키 발급 요령</h2></div></div>
        <ol className="api-help-steps">
          <li>NEXON Open API에 넥슨 ID로 로그인합니다.</li>
          <li><b>내 애플리케이션 → 애플리케이션 등록</b>으로 이동합니다.</li>
          <li>게임은 <b>메이플스토리</b>, 애플리케이션 타입은 <b>서비스 단계</b>를 선택합니다.</li>
          <li>아래 문구를 복사해 입력하고 대표 이미지에는 앱 아이콘이나 대시보드 화면을 첨부합니다.</li>
          <li>약관에 동의해 등록한 뒤 상세 페이지에서 새 API 키를 확인하고 이 앱의 키 변경란에 입력합니다.</li>
        </ol>
        <div className="api-registration-fields">
          <div className="api-copy-row official-row"><div><b>NEXON Open API</b><code>{nexonOpenApiUrl}</code></div><button onClick={() => void copyText("nexon", nexonOpenApiUrl)}>{copied === "nexon" ? <CheckCircle2 /> : <Copy />}{copied === "nexon" ? "복사됨" : "주소 복사"}</button></div>
          {fields.map((field) => <div className="api-copy-row" key={field.id}><div><b>{field.label}</b><code>{field.value}</code></div><button onClick={() => void copyText(field.id, field.value)}>{copied === field.id ? <CheckCircle2 /> : <Copy />}{copied === field.id ? "복사됨" : "복사"}</button></div>)}
        </div>
        {error && <div className="error-banner api-help-error">{error}</div>}
        <div className="api-key-warning"><ShieldAlert /><p><b>API 키는 공개 정보가 아닙니다.</b><span>발급된 키를 GitHub 저장소, 이슈, 채팅이나 스크린샷에 올리지 말고 이 앱의 API 키 입력란에만 붙여 넣어 주세요.</span></p></div>
        <small className="api-help-source">NEXON 공식 안내 기준이며 등록 화면의 세부 명칭은 변경될 수 있습니다. 서비스 단계는 유효한 URL, 서비스 소개와 API 활용 목적을 모두 요구합니다.</small>
      </section>
    </div>
  );
}
