# Windows에서 설치 가능한 Android ARM64 APK를 생성하고 자체 서명합니다.
$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
$version = (Get-Content -LiteralPath (Join-Path $projectRoot "package.json") | ConvertFrom-Json).version
$sdkRoot = Join-Path $env:LOCALAPPDATA "Android\Sdk"
$javaHome = "C:\Program Files\Android\Android Studio\jbr"
$ndkRoot = Get-ChildItem -LiteralPath (Join-Path $sdkRoot "ndk") -Directory |
    Sort-Object Name -Descending |
    Select-Object -First 1 -ExpandProperty FullName

if (-not (Test-Path -LiteralPath $sdkRoot) -or -not (Test-Path -LiteralPath $javaHome) -or -not $ndkRoot) {
    throw "Install the Android SDK and NDK from Android Studio first."
}

$env:ANDROID_HOME = $sdkRoot
$env:ANDROID_SDK_ROOT = $sdkRoot
$env:NDK_HOME = $ndkRoot
$env:JAVA_HOME = $javaHome

Push-Location $projectRoot
try {
    $savedErrorActionPreference = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    $buildOutput = & npm run tauri -- android build --apk --target aarch64 --ci 2>&1
    $buildExitCode = $LASTEXITCODE
    $ErrorActionPreference = $savedErrorActionPreference
    $buildOutput | ForEach-Object { Write-Host $_ }

    if ($buildExitCode -ne 0) {
        $symlinkFailure = ($buildOutput | Out-String) -match "Creation symbolic link is not allowed"
        if (-not $symlinkFailure) {
            throw "The Android native build failed. Review the error above."
        }

        $nativeSource = Join-Path $projectRoot "src-tauri\target\aarch64-linux-android\release\libmaple_guild_tracker_lib.so"
        $nativeDirectory = Join-Path $projectRoot "src-tauri\gen\android\app\src\main\jniLibs\arm64-v8a"
        New-Item -ItemType Directory -Path $nativeDirectory -Force | Out-Null
        Copy-Item -LiteralPath $nativeSource -Destination (Join-Path $nativeDirectory "libmaple_guild_tracker_lib.so") -Force

        Push-Location (Join-Path $projectRoot "src-tauri\gen\android")
        try {
            & .\gradlew.bat assembleArm64Release -x rustBuildArm64Release --rerun-tasks
            if ($LASTEXITCODE -ne 0) {
                throw "Gradle APK packaging failed."
            }
        }
        finally {
            Pop-Location
        }
    }

    $unsignedApk = Join-Path $projectRoot "src-tauri\gen\android\app\build\outputs\apk\arm64\release\app-arm64-release-unsigned.apk"
    if (-not (Test-Path -LiteralPath $unsignedApk)) {
        throw "The generated Android APK was not found."
    }

    $buildTools = Get-ChildItem -LiteralPath (Join-Path $sdkRoot "build-tools") -Directory |
        Sort-Object Name -Descending |
        Select-Object -First 1 -ExpandProperty FullName
    $releaseDirectory = Join-Path $projectRoot "release"
    $alignedApk = Join-Path $releaseDirectory "guildmate-follow-android-arm64-aligned.apk"
    $signedWorkApk = Join-Path $releaseDirectory "guildmate-follow-android-arm64-v$version.apk"
    $keystore = Join-Path $releaseDirectory ".android-dev.keystore"
    New-Item -ItemType Directory -Path $releaseDirectory -Force | Out-Null

    & (Join-Path $buildTools "zipalign.exe") -f -p 4 $unsignedApk $alignedApk
    if ($LASTEXITCODE -ne 0) {
        throw "APK alignment failed."
    }

    if (-not (Test-Path -LiteralPath $keystore)) {
        & (Join-Path $javaHome "bin\keytool.exe") -genkeypair -v -keystore $keystore -storepass android -alias androiddev -keypass android -keyalg RSA -keysize 2048 -validity 10000 -dname "CN=Guildmate Follow, O=Local, C=KR"
        if ($LASTEXITCODE -ne 0) {
            throw "The local APK signing key could not be generated."
        }
    }

    & (Join-Path $buildTools "apksigner.bat") sign --ks $keystore --ks-pass pass:android --key-pass pass:android --ks-key-alias androiddev --out $signedWorkApk $alignedApk
    if ($LASTEXITCODE -ne 0) {
        throw "APK signing failed."
    }
    & (Join-Path $buildTools "apksigner.bat") verify --verbose $signedWorkApk
    if ($LASTEXITCODE -ne 0) {
        throw "APK signature verification failed."
    }
    Write-Host "Android APK created. $signedWorkApk"
}
finally {
    Pop-Location
}
