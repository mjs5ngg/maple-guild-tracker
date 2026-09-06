# 웹 대시보드와 개인 직접 조회 화면을 각각 빌드합니다.
$ErrorActionPreference = 'Stop'
Set-Location (Split-Path $PSScriptRoot -Parent)
& npx.cmd tsc --noEmit
if ($LASTEXITCODE -ne 0) { throw 'TypeScript 검사 실패' }
$env:WEB_DIRECT = '0'
& npx.cmd vite build --config vite.web.config.ts
if ($LASTEXITCODE -ne 0) { throw '대시보드 빌드 실패' }
$env:WEB_DIRECT = '1'
& npx.cmd vite build --config vite.web.config.ts
if ($LASTEXITCODE -ne 0) { throw '개인 조회 빌드 실패' }
Remove-Item Env:WEB_DIRECT
