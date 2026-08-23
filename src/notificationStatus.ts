// 모바일 알림 환경의 표시 상태와 사용자 조치 문구를 결정합니다.
import type { MobileNotificationStatus } from "./types";

export type NotificationState = "checking" | "available" | "unavailable";

export interface NotificationPresentation {
  state: NotificationState;
  title: string;
  monitoringLabel: string;
  message: string;
  showBackgroundSettings: boolean;
}

function normalizedIssue(value?: string | null): string {
  const issue = value?.trim() ?? "";
  return issue.toLowerCase() === "null" ? "" : issue;
}

export function notificationPresentation(
  status: MobileNotificationStatus | null,
  error: string,
  loading: boolean,
): NotificationPresentation {
  if (!status) {
    return {
      state: loading ? "checking" : "unavailable",
      title: loading ? "알림 환경 확인 중" : "알림 상태 확인 불가",
      monitoringLabel: "확인 중",
      message: normalizedIssue(error) || "알림 상태를 불러오지 못했습니다. 지금 다시 확인해 주세요.",
      showBackgroundSettings: false,
    };
  }

  const issue = normalizedIssue(error) || normalizedIssue(status.issue);
  const notificationReady = status.supported && status.permission_granted && status.system_enabled && status.channel_enabled;
  if (!notificationReady) {
    return {
      state: "unavailable",
      title: "알림 사용 불가",
      monitoringLabel: "중지됨",
      message: issue || "알림 설정 열기에서 길드원 따라가기의 알림 권한을 허용해 주세요.",
      showBackgroundSettings: false,
    };
  }
  if (status.monitoring_healthy) {
    return {
      state: "available",
      title: "알림 사용 가능",
      monitoringLabel: "정상",
      message: "백그라운드 감시가 최근 정상적으로 실행됐습니다.",
      showBackgroundSettings: false,
    };
  }
  if (!status.last_success_at && !issue) {
    return {
      state: "checking",
      title: "백그라운드 감시 확인 중",
      monitoringLabel: "시작 중",
      message: "첫 감시 결과를 기다리고 있습니다. 지금 다시 확인을 누르고 잠시 기다려 주세요.",
      showBackgroundSettings: true,
    };
  }
  return {
    state: "unavailable",
    title: "알림 사용 불가",
    monitoringLabel: "작동 안 함",
    message: `${issue || "백그라운드 감시가 최근 정상적으로 실행되지 않았습니다."} 지금 다시 확인한 뒤에도 계속되면 앱 정보에서 배터리 사용을 제한 없음으로 설정해 주세요.`,
    showBackgroundSettings: true,
  };
}
