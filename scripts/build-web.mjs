// Windows와 Linux에서 동일하게 웹 두 화면을 검사하고 빌드합니다.
import { spawnSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

const cwd = fileURLToPath(new URL("../", import.meta.url));
for (const [script, args, extraEnv] of [
  ["typescript/bin/tsc", ["--noEmit"], {}],
  ["vite/bin/vite.js", ["build", "--config", "vite.web.config.ts"], { WEB_DIRECT: "0" }],
  ["vite/bin/vite.js", ["build", "--config", "vite.web.config.ts"], { WEB_DIRECT: "1" }],
  ["vite/bin/vite.js", ["build", "--config", "vite.web.config.ts"], { WEB_DIRECT: "0", WEB_AD_HOST: "1" }],
]) {
  const result = spawnSync(process.execPath, [`node_modules/${script}`, ...args], {
    cwd, env: { ...process.env, ...extraEnv }, stdio: "inherit",
  });
  if (result.error || result.status !== 0) {
    console.error("웹 검사 또는 빌드가 실패했습니다.");
    process.exit(result.status || 1);
  }
}

const dashboardAssets = readdirSync(new URL("../web-dist/dashboard/assets/", import.meta.url)).filter(name => name.endsWith(".js"));
const dashboardBundle = dashboardAssets.map(name => readFileSync(new URL(`../web-dist/dashboard/assets/${name}`, import.meta.url), "utf8")).join("\n");
if (dashboardBundle.includes("http://127.0.0.1:3101") || !dashboardBundle.includes("https://maple-exp-personal.pages.dev")) {
  console.error("공개 대시보드 번들에 개인 조회 운영 주소가 반영되지 않았습니다.");
  process.exit(1);
}
if (process.env.WEB_MONETIZATION_ENABLED !== "1" && dashboardBundle.includes("https://ads.guildfollow.com")) {
  console.error("광고 비활성 빌드에 광고 출처가 포함되었습니다.");
  process.exit(1);
}
const directAssets = readdirSync(new URL("../web-dist/direct/assets/", import.meta.url)).filter(name => name.endsWith(".js"));
const directBundle = directAssets.map(name => readFileSync(new URL(`../web-dist/direct/assets/${name}`, import.meta.url), "utf8")).join("\n");
if (directBundle.includes("ads.guildfollow.com") || directBundle.includes("maple-exp-ads.pages.dev") || directBundle.includes("WEB_ADVERTICA_")) {
  console.error("개인 조회 번들에 광고 코드가 포함되었습니다.");
  process.exit(1);
}
const adAssets = readdirSync(new URL("../web-dist/ads/assets/", import.meta.url)).filter(name => name.endsWith(".js"));
const adBundle = adAssets.map(name => readFileSync(new URL(`../web-dist/ads/assets/${name}`, import.meta.url), "utf8")).join("\n");
const configuredAdTags = Object.entries(process.env).filter(([name, value]) => name.startsWith("WEB_ADVERTICA_") && name.endsWith("_TAG_B64") && value).map(([, value]) => value);
if (configuredAdTags.some(tag => dashboardBundle.includes(tag) || directBundle.includes(tag))) {
  console.error("광고 태그의 격리 번들 경계를 확인하세요.");
  process.exit(1);
}
