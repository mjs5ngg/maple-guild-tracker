# 로그인 사용자 권한으로 숨김 주간 D1 백업 예약 작업을 설치합니다.
$ErrorActionPreference = "Stop"
$backupScript = Join-Path $PSScriptRoot "backup-edge-d1.ps1"
$taskName = "Guildmate Follow D1 Backup"
$action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$backupScript`""
$trigger = New-ScheduledTaskTrigger -Weekly -DaysOfWeek Sunday -At "04:20"
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -DontStopIfGoingOnBatteries
Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings -Description "길드원 따라가기 공개 설정 DB의 암호화 주간 백업" -Force | Out-Null
Write-Output "예약 작업 '$taskName'을 설치했습니다."
