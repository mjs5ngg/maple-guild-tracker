// Android 앱에 내장할 대시보드와 직접 조회 엔진을 한 폴더(web-dist/app)로 빌드합니다.
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

const cwd = fileURLToPath(new URL("../", import.meta.url));
// 대시보드를 먼저 빌드해야 web-dist/app을 비운 뒤 direct/가 그 안에 들어갑니다.
for (const extraEnv of [{ WEB_APP: "1", WEB_DIRECT: "0" }, { WEB_APP: "1", WEB_DIRECT: "1" }]) {
  const result = spawnSync(process.execPath, ["node_modules/vite/bin/vite.js", "build", "--config", "vite.web.config.ts"], {
    cwd, env: { ...process.env, WEB_MONETIZATION_ENABLED: "0", ...extraEnv }, stdio: "inherit",
  });
  if (result.error || result.status !== 0) {
    console.error("앱 내장 화면 빌드가 실패했습니다.");
    process.exit(result.status || 1);
  }
}
const bundle = dir => readdirSync(new URL(`../web-dist/app/${dir}assets/`, import.meta.url)).filter(name => name.endsWith(".js"))
  .map(name => readFileSync(new URL(`../web-dist/app/${dir}assets/${name}`, import.meta.url), "utf8")).join("\n");
const dashboard = bundle(""), direct = bundle("direct/");
if (!existsSync(new URL("../web-dist/app/direct/index.html", import.meta.url)) || !dashboard.includes("https://guildfollow.com")) {
  console.error("앱 내장 빌드의 엔진 경로 또는 API 주소를 확인하세요.");
  process.exit(1);
}
if ([dashboard, direct].some(code => code.includes("ads.guildfollow.com") || code.includes("maple-exp-personal.pages.dev") || code.includes("127.0.0.1:310"))) {
  console.error("앱 내장 빌드에 광고·원격 엔진·로컬 개발 주소가 섞였습니다.");
  process.exit(1);
}
