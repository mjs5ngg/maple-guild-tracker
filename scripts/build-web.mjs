// Windows와 Linux에서 동일하게 웹 두 화면을 검사하고 빌드합니다.
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const cwd = fileURLToPath(new URL("../", import.meta.url));
for (const [script, args, extraEnv] of [
  ["typescript/bin/tsc", ["--noEmit"], {}],
  ["vite/bin/vite.js", ["build", "--config", "vite.web.config.ts"], { WEB_DIRECT: "0" }],
  ["vite/bin/vite.js", ["build", "--config", "vite.web.config.ts"], { WEB_DIRECT: "1" }],
]) {
  const result = spawnSync(process.execPath, [`node_modules/${script}`, ...args], {
    cwd, env: { ...process.env, ...extraEnv }, stdio: "inherit",
  });
  if (result.error || result.status !== 0) {
    console.error("웹 검사 또는 빌드가 실패했습니다.");
    process.exit(result.status || 1);
  }
}
