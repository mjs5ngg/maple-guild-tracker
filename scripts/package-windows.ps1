# Windows 설치본과 포터블 실행 파일을 배포 폴더에 모읍니다.
$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
$releaseDir = Join-Path $projectRoot "release"
$installerDir = Join-Path $projectRoot "src-tauri\target\release\bundle\nsis"
$portableSource = Join-Path $projectRoot "src-tauri\target\release\maple-guild-tracker.exe"

Push-Location $projectRoot
try {
    npm run tauri build
    if ($LASTEXITCODE -ne 0) {
        throw "Tauri 릴리스 빌드에 실패했습니다."
    }

    New-Item -ItemType Directory -Force -Path $releaseDir | Out-Null
    $installerSource = Get-ChildItem -LiteralPath $installerDir -Filter "*-setup.exe" | Select-Object -First 1
    if (-not $installerSource) {
        throw "NSIS installer was not created."
    }
    Copy-Item -LiteralPath $installerSource.FullName -Destination (Join-Path $releaseDir "Maple-Guild-Tracker-Setup.exe") -Force
    Copy-Item -LiteralPath $portableSource -Destination (Join-Path $releaseDir "Maple-Guild-Tracker-Portable.exe") -Force
}
finally {
    Pop-Location
}

Write-Host "Windows distribution files were created in the release directory."
