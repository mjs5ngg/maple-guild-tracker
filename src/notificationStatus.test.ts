// 모바일 알림 상태가 실제 감시 가능 여부에 맞게 표시되는지 검증합니다.
import { describe, expect, it } from "vitest";
import type { MobileNotificationStatus } from "./types";
import { notificationPresentation } from "./notificationStatus";

const healthy: MobileNotificationStatus = {
  supported: true,
  permission_granted: true,
  system_enabled: true,
  channel_enabled: true,
  monitoring_healthy: true,
  issue: null,
  last_success_at: Date.now(),
};

describe("notificationPresentation", () => {
  it("문자열 null은 오류 안내로 표시하지 않는다", () => {
    expect(notificationPresentation({ ...healthy, issue: "null" }, "", false)).toMatchObject({
      state: "available",
      title: "알림 사용 가능",
    });
  });

  it("백그라운드 감시가 비정상이면 권한이 있어도 사용 불가로 표시한다", () => {
    expect(notificationPresentation({ ...healthy, monitoring_healthy: false, issue: "한 시간 이상 실행되지 않았습니다." }, "", false)).toMatchObject({
      state: "unavailable",
      monitoringLabel: "작동 안 함",
      showBackgroundSettings: true,
    });
  });

  it("첫 성공 전에는 사용 가능이 아니라 확인 중으로 표시한다", () => {
    expect(notificationPresentation({ ...healthy, monitoring_healthy: false, last_success_at: null }, "", false)).toMatchObject({
      state: "checking",
      monitoringLabel: "시작 중",
    });
  });
});
