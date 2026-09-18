# 로그온 동안 WSL 배포판이 유휴 종료되지 않도록 keepalive 세션을 유지하는 작업 스케줄러용 스크립트

$ErrorActionPreference = "Continue"

$distroName = "Ubuntu-24.04"
$keepAliveMarker = "MAPLE_OPERATIONS_KEEPALIVE=1"

while ($true) {
    # 바로가기 스크립트가 이미 띄운 keepalive가 있으면 새로 만들지 않고 그 세션이 끝날 때까지 기다린다.
    $existing = Get-CimInstance Win32_Process -Filter "Name='wsl.exe'" |
        Where-Object { $_.CommandLine -like "*$keepAliveMarker*" }
    if ($existing) {
        Wait-Process -Id $existing.ProcessId -ErrorAction SilentlyContinue
    }
    else {
        # wsl --shutdown, WSL 업데이트 등으로 세션이 끝나면 반환되고 다음 반복에서 다시 띄운다.
        & wsl.exe -d $distroName --exec /usr/bin/env $keepAliveMarker sleep infinity
    }
    Start-Sleep -Seconds 10
}
