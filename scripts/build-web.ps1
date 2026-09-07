# 웹 대시보드와 개인 직접 조회 화면을 각각 빌드합니다.
$ErrorActionPreference = 'Stop'
Set-Location (Split-Path $PSScriptRoot -Parent)
& node scripts/build-web.mjs
if ($LASTEXITCODE -ne 0) { throw '웹 빌드 실패' }
