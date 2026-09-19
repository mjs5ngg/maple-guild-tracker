# 플레이 스토어 업로드 키를 저장소 밖에 한 번만 만듭니다. 비밀번호는 keytool이 직접 묻습니다.
$ErrorActionPreference = "Stop"

$keyDirectory = Join-Path $env:USERPROFILE ".guildfollow"
$keystore = Join-Path $keyDirectory "upload.jks"
$keytool = "C:\Program Files\Android\Android Studio\jbr\bin\keytool.exe"

if (Test-Path -LiteralPath $keystore) {
    throw "업로드 키가 이미 있습니다: $keystore  (다시 만들면 기존 키로 올린 앱을 갱신할 수 없으니 지우지 마세요.)"
}
if (-not (Test-Path -LiteralPath $keytool)) {
    throw "Android Studio의 keytool을 찾을 수 없습니다: $keytool"
}
New-Item -ItemType Directory -Path $keyDirectory -Force | Out-Null

Write-Host "업로드 키를 만듭니다. 이어서 키 저장소 비밀번호를 두 번 입력하세요(화면에 표시되지 않습니다)."
& $keytool -genkeypair -v -keystore $keystore -alias upload -keyalg RSA -keysize 4096 -validity 10000 -dname "CN=Guildfollow, O=Guildfollow, C=KR"
if ($LASTEXITCODE -ne 0) {
    throw "업로드 키를 만들지 못했습니다."
}

Write-Host ""
Write-Host "완료: $keystore"
Write-Host "꼭 해 주세요:"
Write-Host "  1. 이 파일과 비밀번호를 비밀번호 관리자나 외장 저장소에 따로 백업하세요."
Write-Host "  2. 키를 잃어버리면 Play Console에서 업로드 키 재설정을 요청해야 합니다(며칠 걸림)."
Write-Host "  3. 이 파일은 저장소(git)에 넣지 마세요."
