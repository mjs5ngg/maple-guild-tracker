# 플레이 스토어에 올릴 AAB(arm64·armv7·x86_64)를 만들고 업로드 키로 서명합니다.
# 사용법: 서명하지 않고 빌드만 -> .\scripts\package-android-play.ps1 -SkipSign
#         빌드 후 서명         -> .\scripts\package-android-play.ps1   (비밀번호는 실행 중 직접 입력)
param([switch]$SkipSign)
$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
$version = (Get-Content -LiteralPath (Join-Path $projectRoot "package.json") | ConvertFrom-Json).version
$sdkRoot = Join-Path $env:LOCALAPPDATA "Android\Sdk"
$javaHome = "C:\Program Files\Android\Android Studio\jbr"
$ndkRoot = Get-ChildItem -LiteralPath (Join-Path $sdkRoot "ndk") -Directory |
    Sort-Object Name -Descending |
    Select-Object -First 1 -ExpandProperty FullName
$keystore = Join-Path $env:USERPROFILE ".guildfollow\upload.jks"

$env:ANDROID_HOME = $sdkRoot
$env:ANDROID_SDK_ROOT = $sdkRoot
$env:NDK_HOME = $ndkRoot
$env:JAVA_HOME = $javaHome

if (-not $SkipSign -and -not (Test-Path -LiteralPath $keystore)) {
    throw "업로드 키가 없습니다. 먼저 .\scripts\create-upload-key.ps1 을 실행하세요."
}

$targets = @("aarch64", "armv7", "x86_64")
$abiDirectories = @{ aarch64 = "arm64-v8a"; armv7 = "armeabi-v7a"; x86_64 = "x86_64" }
$rustTargets = @{ aarch64 = "aarch64-linux-android"; armv7 = "armv7-linux-androideabi"; x86_64 = "x86_64-linux-android" }

Push-Location $projectRoot
try {
    # Windows 개발자 모드가 꺼져 있으면 Tauri가 jniLibs 심볼릭 링크에서 멈추고 다음 대상으로 넘어가지 않습니다.
    # 그래서 대상마다 따로 빌드하고, 만들어진 네이티브 라이브러리를 복사한 뒤 Gradle로 한 번에 묶습니다.
    foreach ($target in $targets) {
        $savedErrorActionPreference = $ErrorActionPreference
        $ErrorActionPreference = "Continue"
        $buildOutput = & npm run tauri -- android build --aab --target $target --ci 2>&1
        $buildExitCode = $LASTEXITCODE
        $ErrorActionPreference = $savedErrorActionPreference
        $buildOutput | Select-Object -Last 15 | ForEach-Object { Write-Host $_ }
        if ($buildExitCode -ne 0 -and -not (($buildOutput | Out-String) -match "Creation symbolic link is not allowed")) {
            throw "$target Android 네이티브 빌드에 실패했습니다. 위 오류를 확인하세요."
        }
        $source = Join-Path $projectRoot "src-tauri\target\$($rustTargets[$target])\release\libmaple_guild_tracker_lib.so"
        if (-not (Test-Path -LiteralPath $source)) {
            throw "$target 네이티브 라이브러리가 없습니다: $source"
        }
        $destination = Join-Path $projectRoot "src-tauri\gen\android\app\src\main\jniLibs\$($abiDirectories[$target])"
        New-Item -ItemType Directory -Path $destination -Force | Out-Null
        Copy-Item -LiteralPath $source -Destination (Join-Path $destination "libmaple_guild_tracker_lib.so") -Force
    }
    Push-Location (Join-Path $projectRoot "src-tauri\gen\android")
    try {
        & .\gradlew.bat bundleUniversalRelease -x rustBuildUniversalRelease --rerun-tasks
        if ($LASTEXITCODE -ne 0) {
            throw "Gradle AAB 묶기에 실패했습니다."
        }
    }
    finally {
        Pop-Location
    }

    $bundle = Get-ChildItem -LiteralPath (Join-Path $projectRoot "src-tauri\gen\android\app\build\outputs\bundle") -Recurse -Filter "*.aab" |
        Sort-Object LastWriteTime -Descending |
        Select-Object -First 1
    if (-not $bundle) {
        throw "생성된 AAB를 찾을 수 없습니다."
    }

    $releaseDirectory = Join-Path $projectRoot "release"
    New-Item -ItemType Directory -Path $releaseDirectory -Force | Out-Null
    $output = Join-Path $releaseDirectory "guildfollow-play-v$version.aab"
    Copy-Item -LiteralPath $bundle.FullName -Destination $output -Force

    if ($SkipSign) {
        Write-Host "서명하지 않은 AAB를 만들었습니다: $output"
        return
    }

    $password = Read-Host "업로드 키 비밀번호" -AsSecureString
    $plain = [Runtime.InteropServices.Marshal]::PtrToStringBSTR([Runtime.InteropServices.Marshal]::SecureStringToBSTR($password))
    try {
        $env:GUILDFOLLOW_UPLOAD_PASSWORD = $plain
        & (Join-Path $javaHome "bin\jarsigner.exe") -keystore $keystore -storepass:env GUILDFOLLOW_UPLOAD_PASSWORD -sigalg SHA256withRSA -digestalg SHA-256 $output upload
        if ($LASTEXITCODE -ne 0) {
            throw "AAB 서명에 실패했습니다."
        }
    }
    finally {
        Remove-Item Env:\GUILDFOLLOW_UPLOAD_PASSWORD -ErrorAction SilentlyContinue
        $plain = $null
    }
    & (Join-Path $javaHome "bin\jarsigner.exe") -verify $output
    if ($LASTEXITCODE -ne 0) {
        throw "AAB 서명 검증에 실패했습니다."
    }
    Write-Host "Play 업로드용 AAB를 만들었습니다: $output"
}
finally {
    Pop-Location
}
