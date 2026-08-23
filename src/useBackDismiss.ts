// Android 뒤로가기로 가장 위에 열린 대화창만 닫는 기록 상태를 관리합니다.
import { useCallback, useEffect, useRef } from "react";

const historyKey = "__guildmateDialogs";
const isAndroidRuntime = /Android/i.test(navigator.userAgent);
let nextDialogId = 0;

function dialogStack(state: unknown): string[] {
  if (!state || typeof state !== "object") return [];
  const value = (state as Record<string, unknown>)[historyKey];
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

export function useBackDismiss(open: boolean, onDismiss: () => void) {
  const idRef = useRef("");
  if (!idRef.current) idRef.current = `dialog-${++nextDialogId}`;
  const dismissRef = useRef(onDismiss);
  dismissRef.current = onDismiss;

  useEffect(() => {
    if (!open || !isAndroidRuntime) return;
    const id = idRef.current;
    const currentState = history.state && typeof history.state === "object" ? history.state : {};
    const stack = dialogStack(currentState);
    if (!stack.includes(id)) {
      history.pushState({ ...currentState, [historyKey]: [...stack, id] }, "");
    }
    const handlePopState = (event: PopStateEvent) => {
      if (!dialogStack(event.state).includes(id)) dismissRef.current();
    };
    globalThis.addEventListener("popstate", handlePopState);
    return () => globalThis.removeEventListener("popstate", handlePopState);
  }, [open]);

  return useCallback(() => {
    if (!open) return;
    if (isAndroidRuntime && dialogStack(history.state).includes(idRef.current)) {
      history.back();
    } else {
      dismissRef.current();
    }
  }, [open]);
}
