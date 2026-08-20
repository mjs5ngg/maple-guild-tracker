// Tauri 네이티브 명령을 타입 안전한 함수로 노출합니다.
import { invoke } from "@tauri-apps/api/core";
import type { AppStatus, DashboardData, SetupResult, SyncReport } from "./types";

export const native = {
  status: () => invoke<AppStatus>("get_app_status"),
  setup: (apiKey: string, primaryName: string) =>
    invoke<SetupResult>("save_setup", { apiKey, primaryName }),
  replaceApiKey: (apiKey: string) =>
    invoke<SetupResult>("replace_api_key", { apiKey }),
  sync: (days?: number) => invoke<SyncReport>("sync_now", { days }),
  liveSync: () => invoke<SyncReport>("sync_live_now"),
  changePrimary: (characterId: number) => invoke<AppStatus>("change_primary", { characterId }),
  dashboard: (period: string) => invoke<DashboardData>("get_dashboard", { period }),
  favorite: (characterId: number, favorite: boolean) =>
    invoke<void>("set_favorite", { characterId, favorite }),
  addExternal: (characterName: string) =>
    invoke<SetupResult>("add_external_favorite", { characterName }),
  showDashboard: () => invoke<void>("show_dashboard"),
  showWidget: () => invoke<void>("show_widget"),
  hideWindow: () => invoke<void>("hide_current_window"),
  setWidgetOpacity: (opacity: number) => invoke<void>("set_widget_opacity", { opacity }),
};
