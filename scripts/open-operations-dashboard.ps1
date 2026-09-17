# 로컬 운영 서비스를 확인해 관리자 대시보드를 여는 실행 스크립트

$ErrorActionPreference = "Stop"

$dashboardUrl = "http://127.0.0.1:3103/"
$distroName = "Ubuntu-24.04"
$serviceName = "maple-exp-operations.service"

try {
    & wsl.exe -d $distroName -- bash -lc "systemctl start $serviceName" | Out-Null
    if ($LASTEXITCODE -ne 0) {
        throw "WSL 운영 서비스를 시작하지 못했습니다."
    }

    $ready = $false
    for ($attempt = 0; $attempt -lt 30; $attempt += 1) {
        try {
            $response = Invoke-WebRequest -UseBasicParsing -Uri $dashboardUrl -TimeoutSec 2
            if ($response.StatusCode -eq 200) {
                $ready = $true
                break
            }
        }
        catch {
            Start-Sleep -Milliseconds 500
        }
    }

    if (-not $ready) {
        throw "관리자 대시보드가 제한 시간 안에 응답하지 않았습니다."
    }

    Start-Process $dashboardUrl
}
catch {
    Add-Type -AssemblyName PresentationFramework
    [System.Windows.MessageBox]::Show(
        "관리자 대시보드를 열지 못했습니다.`n`n$($_.Exception.Message)",
        "길드원 따라가기 관리자",
        "OK",
        "Error"
    ) | Out-Null
    exit 1
}
