# 공개 주소를 강제해 로컬 URL 혼입 없이 Worker와 정적 웹을 배포합니다.
param([switch]$ApplyMigrations)
$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent $PSScriptRoot
$publicOrigin = "https://guildfollow.com"
$directOrigin = "https://maple-exp-personal.pages.dev"
$adOrigin = "https://ads.guildfollow.com"

Push-Location $projectRoot
try {
    $monetizationFile = Join-Path $projectRoot ".env.monetization"
    if (Test-Path -LiteralPath $monetizationFile) {
        Get-Content -LiteralPath $monetizationFile | ForEach-Object {
            if ($_ -match '^\s*([A-Z0-9_]+)=(.*)$') { [Environment]::SetEnvironmentVariable($Matches[1], $Matches[2], "Process") }
        }
    }
    $env:PUBLIC_ORIGIN = $publicOrigin
    $env:WEB_DASHBOARD_ORIGIN = $publicOrigin
    $env:WEB_DIRECT_ORIGIN = $directOrigin
    $env:WEB_AD_HOST_ORIGIN = $adOrigin
    npm run web:build
    if ($LASTEXITCODE -ne 0) { throw "공개 웹 빌드가 실패했습니다." }
    if ($ApplyMigrations) {
        npx wrangler d1 migrations apply maple-exp-public --remote --config edge/wrangler.jsonc
        if ($LASTEXITCODE -ne 0) { throw "D1 마이그레이션이 실패했습니다." }
    }
    npx wrangler pages deploy web-dist/direct --project-name maple-exp-personal --branch main
    if ($LASTEXITCODE -ne 0) { throw "개인 직접 조회 Pages 배포가 실패했습니다." }
    npx wrangler pages deploy web-dist/ads --project-name maple-exp-ads --branch main
    if ($LASTEXITCODE -ne 0) { throw "광고 격리 Pages 배포가 실패했습니다." }
    npx wrangler deploy --config edge/wrangler.jsonc
    if ($LASTEXITCODE -ne 0) { throw "Worker 배포가 실패했습니다." }
}
finally {
    Pop-Location
}
