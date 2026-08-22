// 웹 화면과 네이티브 창의 다크·라이트 테마를 함께 적용합니다.
import { getCurrentWindow } from "@tauri-apps/api/window";

export type AppTheme = "dark" | "light";
export const themeStorageKey = "app-theme";

export function getStoredTheme(): AppTheme {
  return localStorage.getItem(themeStorageKey) === "light" ? "light" : "dark";
}

export function applyTheme(theme: AppTheme): void {
  document.documentElement.dataset.theme = theme;
  localStorage.setItem(themeStorageKey, theme);
  void getCurrentWindow().setTheme(theme);
}
