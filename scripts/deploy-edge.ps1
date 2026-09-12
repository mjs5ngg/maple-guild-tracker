# 공개 주소를 강제해 로컬 URL 혼입 없이 Worker와 정적 웹을 배포합니다.
$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent $PSScriptRoot
$publicOrigin = "https://maple-exp-public.mjs5ng.workers.dev"
$directOrigin = "https://maple-exp-personal.pages.dev"

Push-Location $projectRoot
try {
    $env:PUBLIC_ORIGIN = $publicOrigin
    $env:WEB_DASHBOARD_ORIGIN = $publicOrigin
    $env:WEB_DIRECT_ORIGIN = $directOrigin
    npm run web:build
    if ($LASTEXITCODE -ne 0) { throw "공개 웹 빌드가 실패했습니다." }
    npx wrangler d1 migrations apply maple-exp-public --remote --config edge/wrangler.jsonc
    if ($LASTEXITCODE -ne 0) { throw "D1 마이그레이션이 실패했습니다." }
    npx wrangler deploy --config edge/wrangler.jsonc
    if ($LASTEXITCODE -ne 0) { throw "Worker 배포가 실패했습니다." }
}
finally {
    Pop-Location
}
