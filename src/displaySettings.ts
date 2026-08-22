// 대시보드와 위젯 사이에서 화면·캐릭터 이미지 배율을 즉시 동기화합니다.
import { emit, listen, type UnlistenFn } from "@tauri-apps/api/event";

export interface DisplaySettings {
  uiScale: number;
  avatarScale: number;
}

export const defaultDisplaySettings: DisplaySettings = { uiScale: 1.10, avatarScale: 1 };
export const avatarPhysicalBase = 1.5;
const storageKey = "display-settings-v3";
const eventName = "display-settings-changed";

export function getDisplaySettings(): DisplaySettings {
  try {
    const stored = JSON.parse(localStorage.getItem(storageKey) || "null") as Partial<DisplaySettings> | null;
    return {
      uiScale: typeof stored?.uiScale === "number" ? stored.uiScale : defaultDisplaySettings.uiScale,
      avatarScale: typeof stored?.avatarScale === "number" ? stored.avatarScale : defaultDisplaySettings.avatarScale,
    };
  } catch {
    return defaultDisplaySettings;
  }
}

export function saveDisplaySettings(settings: DisplaySettings): void {
  localStorage.setItem(storageKey, JSON.stringify(settings));
  void emit(eventName, settings);
}

export function listenDisplaySettings(handler: (settings: DisplaySettings) => void): Promise<UnlistenFn> {
  return listen<DisplaySettings>(eventName, (event) => handler(event.payload));
}
