# 관리자 대시보드가 Cloudflare 무료 제공량을 표시하도록 읽기 전용 분석 토큰을 WSL 운영 설정에 저장합니다.
# 토큰은 화면·명령줄에 남지 않도록 표준 입력으로만 전달합니다.
$ErrorActionPreference = "Stop"

$distroName = "Ubuntu-24.04"
$envFile = "/etc/maple-exp/server.env"
$accountId = "57687045cd680ec85633e84d8574b413"

Write-Host "Cloudflare 대시보드 → 내 프로필 → API 토큰 → 토큰 생성 → 사용자 지정 토큰에서"
Write-Host "권한을 '계정 · Account Analytics · 읽기' 하나만 주고 만든 토큰을 붙여 넣으세요."
$secure = Read-Host "분석 토큰" -AsSecureString
$token = [Runtime.InteropServices.Marshal]::PtrToStringBSTR([Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure))
if ([string]::IsNullOrWhiteSpace($token) -or $token -notmatch '^[A-Za-z0-9_\-]+$') {
    throw "토큰 형식이 올바르지 않습니다."
}

$update = @"
set -eu
token=`$(cat)
tmp=`$(mktemp)
grep -v -E '^(CLOUDFLARE_ACCOUNT_ID|CLOUDFLARE_ANALYTICS_TOKEN)=' $envFile > "`$tmp" || true
printf 'CLOUDFLARE_ACCOUNT_ID=%s\nCLOUDFLARE_ANALYTICS_TOKEN=%s\n' '$accountId' "`$token" >> "`$tmp"
install -m 0600 -o root -g root "`$tmp" $envFile
rm -f "`$tmp"
systemctl restart maple-exp-operations.service
"@
try {
    $token | & wsl.exe -d $distroName -u root -- bash -c ($update -replace "`r", "")
    if ($LASTEXITCODE -ne 0) {
        throw "WSL 설정 저장에 실패했습니다."
    }
}
finally {
    $token = $null
}
Write-Host "저장했습니다. 관리자 대시보드에서 새로고침을 누르면 Cloudflare 무료 제공량이 표시됩니다."
