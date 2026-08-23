// 모바일 즐겨찾기 알림의 동작 조건과 문제 해결 방법을 안내합니다.
import { BatteryWarning, Bell, Clock3, HelpCircle, ShieldCheck, X } from "lucide-react";
import { useBackDismiss } from "../useBackDismiss";

export function NotificationHelpModal({ onClose }: { onClose: () => void }) {
  const dismiss = useBackDismiss(true, onClose);

  return (
    <div className="modal-backdrop api-help-backdrop" onMouseDown={dismiss}>
      <section className="api-help-modal notification-help-modal" onMouseDown={(event) => event.stopPropagation()}>
        <button className="modal-close" onClick={dismiss} aria-label="닫기"><X /></button>
        <div className="api-help-heading"><span><HelpCircle /></span><div><p className="eyebrow">FAVORITE NOTIFICATION</p><h2>즐겨찾기 경험치 알림 안내</h2></div></div>
        <div className="notification-help-grid">
          <article><Bell /><div><b>누구를 알려주나요?</b><p>대표 캐릭터를 제외한 즐겨찾기 캐릭터가 대상입니다. 첫 확인은 비교 기준만 저장하며, 이후 경험치 증가가 확인되면 알림을 보냅니다.</p></div></article>
          <article><Clock3 /><div><b>언제 확인하나요?</b><p>앱 시작 시 즉시 확인하고 백그라운드에서는 Android가 허용하는 약 15분 주기로 확인합니다. 절전 상태나 제조사 정책에 따라 실제 시각은 늦어질 수 있습니다.</p></div></article>
          <article><ShieldCheck /><div><b>알림 사용 가능의 의미</b><p>알림 권한과 시스템 채널이 켜져 있고 최근 1시간 안에 백그라운드 감시가 실제 성공한 경우입니다. 단순히 권한만 허용된 상태는 사용 가능으로 표시하지 않습니다.</p></div></article>
          <article><BatteryWarning /><div><b>작동하지 않을 때</b><p>`지금 다시 확인`을 누르고 잠시 기다려 주세요. 계속 사용 불가라면 `앱 정보 열기`에서 배터리 항목을 찾아 사용을 `제한 없음`으로 변경하고 모바일 데이터나 Wi-Fi 연결도 확인해 주세요.</p></div></article>
        </div>
        <div className="notification-help-note"><b>중복 알림 방지</b><span>경험치가 계속 증가하는 동안에는 같은 사냥 흐름을 반복해서 알리지 않습니다. 증가가 멈춘 뒤 다시 증가하기 시작하면 새 알림을 보냅니다.</span></div>
        <small className="api-help-source">Android에서 앱을 강제 종료하거나 운영체제가 앱을 정지하면 백그라운드 실행이 보장되지 않습니다. 이 경우 앱을 다시 열어 감시 작업을 재등록해 주세요.</small>
      </section>
    </div>
  );
}
