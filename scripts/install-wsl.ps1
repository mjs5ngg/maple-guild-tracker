# 승인된 WSL 및 Ubuntu 설치를 진행하고 결과를 로컬 로그에 남깁니다.
$ErrorActionPreference = 'Stop'
Set-Location (Split-Path $PSScriptRoot -Parent)
$env:WSL_UTF8 = '1'
$OutputEncoding = [System.Text.UTF8Encoding]::new($false)
[Console]::OutputEncoding = $OutputEncoding
$feature = Enable-WindowsOptionalFeature -Online -FeatureName VirtualMachinePlatform -All -NoRestart
$feature | Format-List FeatureName,State,RestartNeeded | Out-File -Encoding utf8 '.local-runtime/wsl-feature.log'
& bcdedit.exe /enum '{current}' | Out-File -Append -Encoding utf8 '.local-runtime/wsl-feature.log'
& wsl.exe --install --distribution Ubuntu-24.04 --no-launch 2>&1 | Out-File -Encoding utf8 '.local-runtime/wsl-install.log'
$installCode = $LASTEXITCODE
"WSL installer exit code: $installCode" | Out-File -Append -Encoding utf8 '.local-runtime/wsl-install.log'
exit $installCode
