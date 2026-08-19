// URL에 따라 대시보드 또는 미니 위젯 React 화면을 시작합니다.
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";

const isWidget = new URLSearchParams(location.search).get("view") === "widget";
const root = createRoot(document.getElementById("root")!);

if (isWidget) {
  void import("./components/Widget").then(({ Widget }) => {
    root.render(<StrictMode><Widget /></StrictMode>);
  });
} else {
  void import("./App").then(({ default: App }) => {
    root.render(<StrictMode><App /></StrictMode>);
  });
}
