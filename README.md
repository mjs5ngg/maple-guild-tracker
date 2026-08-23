# 길드원 따라가기

`길드원 따라가기`는 NEXON Open API를 이용해 대표 캐릭터, 길드원 전체, 외부 즐겨찾기 캐릭터의 날짜별 경험치를 기록하고 비교하는 Windows·Android 로컬 앱입니다.

공식 프로젝트 주소는 [GitHub 저장소](https://github.com/mjs5ngg/maple-guild-tracker)입니다.

## 사용 준비

1. [NEXON Open API](https://openapi.nexon.com/)에서 애플리케이션을 등록하고 API 키를 발급합니다.
2. 설치된 앱을 열고 첫 화면에 API 키와 길드에 가입된 대표 캐릭터명을 직접 입력합니다. 별도 키 파일은 만들지 않습니다.
3. 월드와 길드 확인 후 최근 30일 수집이 끝날 때까지 앱을 종료하지 않습니다.

API 키는 Windows에서는 자격 증명 관리자, Android에서는 Android Keystore로 암호화한 보안 저장소에 보관됩니다. 기록 DB는 각 운영체제의 앱 전용 데이터 폴더에 생성됩니다.

서비스 단계 등 다른 API 키로 바꾸려면 대시보드 우측 상단의 톱니바퀴 버튼을 누르고 새 키를 입력합니다. 대표 캐릭터 조회에 성공한 경우에만 기존 키가 교체됩니다.

## Windows 설치 방법

가장 쉬운 방법은 `release/Guildmate-Follow-Setup.exe`를 더블클릭하고 안내에 따라 설치하는 것입니다. 현재 사용자 영역에 설치되므로 관리자 권한이 필요하지 않습니다.

설치 없이 확인하려면 `release/Guildmate-Follow-Portable.exe`를 실행할 수 있습니다. 자동 시작을 사용할 경우 실행 파일을 옮기면 등록된 경로가 달라지므로 설치본 사용을 권장합니다.

다음 명령은 Windows 설치본과 포터블 EXE를 만든 뒤 같은 버전의 Android APK도 자동으로 생성합니다. 모든 결과물은 프로젝트의 `release` 폴더에 저장됩니다.

```powershell
npm run package:windows
```

## Android 설치 방법

`release/guildmate-follow-android-arm64-v0.2.5.apk`를 Android 기기로 옮겨 실행합니다. 브라우저나 파일 관리자가 요청하면 해당 앱에만 `알 수 없는 앱 설치` 권한을 허용합니다. Android 7.0 이상 ARM64 기기를 지원합니다.

Android판은 메인 대시보드, 설정, 동기화, 길드 순위, 즐겨찾기와 성장 그래프를 제공합니다. Windows 전용 트레이, 로그인 자동 시작과 다른 앱 위에 떠 있는 미니 위젯은 포함하지 않습니다. Android가 백그라운드 앱을 정지할 수 있으므로 앱을 다시 열 때 누락 기록을 보충하고, 화면을 보고 있을 때 주기 동기화를 수행합니다.

Android Studio에서 SDK와 NDK를 설치한 Windows 개발 환경에서는 다음 명령으로 Android APK만 따로 다시 만들 수 있습니다.

```powershell
rustup target add aarch64-linux-android
npm run android:init
npm run package:android
```

## 개발 명령

```powershell
npm install
npm run test
npm run build
npm run tauri dev
npm run package:windows
npm run package:android
```

개발 중 미니 위젯만 확인하려면 빌드된 실행 파일에 `--widget` 인자를 전달합니다.

Rust 단위 테스트는 다음 명령으로 실행합니다.

```powershell
cd src-tauri
cargo test
```

## 데이터 기준

- API 원본은 NEXON Open API의 날짜별 레벨, 현재 레벨 경험치, 경험치율입니다.
- 길드원 외형은 기본 정보 응답의 공식 `character_image` URL을 사용합니다.
- 일일 획득량은 연속된 두 날짜와 버전 고정 레벨별 필요 경험치표로 계산합니다.
- 현재 포함된 계산표는 200~299레벨을 지원합니다.
- 지원하지 않는 레벨, 경험치 역행, 누락 스냅샷은 0이 아니라 계산 불가 상태로 남습니다.
- 환산주스탯 사이트에는 접근하지 않습니다.

Data based on NEXON Open API.
