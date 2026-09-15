# 공개 D1 데이터를 사용자 계정에 묶인 DPAPI 암호문으로 주간 백업합니다.
$ErrorActionPreference = "Stop"
$taskRoot = Split-Path -Parent $PSScriptRoot
$backupRoot = Join-Path $env:LOCALAPPDATA "GuildmateFollow\backups\d1"
$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$plainPath = Join-Path ([System.IO.Path]::GetTempPath()) "guildmate-d1-$timestamp.sql"
$encryptedPath = Join-Path $backupRoot "guildmate-d1-$timestamp.sql.dpapi"

New-Item -ItemType Directory -Force -Path $backupRoot | Out-Null
Add-Type -AssemblyName System.Security
Push-Location $taskRoot
try {
    npx wrangler d1 export maple-exp-public --remote --skip-confirmation --output $plainPath --config edge/wrangler.jsonc
    if ($LASTEXITCODE -ne 0) { throw "D1 원격 내보내기가 실패했습니다." }
    $plainBytes = [System.IO.File]::ReadAllBytes($plainPath)
    $protectedBytes = [System.Security.Cryptography.ProtectedData]::Protect($plainBytes, $null, [System.Security.Cryptography.DataProtectionScope]::CurrentUser)
    [System.IO.File]::WriteAllBytes($encryptedPath, $protectedBytes)
    Get-FileHash -Algorithm SHA256 -LiteralPath $encryptedPath | Select-Object Hash, Path | ConvertTo-Json | Set-Content -Encoding UTF8 -LiteralPath "$encryptedPath.sha256.json"
    Get-ChildItem -LiteralPath $backupRoot -Filter "*.dpapi" | Where-Object LastWriteTime -lt (Get-Date).AddDays(-90) | ForEach-Object {
        Remove-Item -LiteralPath $_.FullName
        $manifest = "$($_.FullName).sha256.json"
        if (Test-Path -LiteralPath $manifest) { Remove-Item -LiteralPath $manifest }
    }
}
finally {
    Pop-Location
    if (Test-Path -LiteralPath $plainPath) { Remove-Item -LiteralPath $plainPath }
}
