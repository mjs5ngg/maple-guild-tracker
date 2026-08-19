# 메이플 길드 트래커

NEXON Open API를 이용해 대표 캐릭터, 길드원 전체, 외부 즐겨찾기 캐릭터의 날짜별 경험치를 기록하고 비교하는 Windows 로컬 앱입니다.

## 사용 준비

1. [NEXON Open API](https://openapi.nexon.com/)에서 애플리케이션을 등록하고 API 키를 발급합니다.
2. 설치된 앱을 열고 API 키와 길드에 가입된 대표 캐릭터명을 입력합니다.
3. 월드와 길드 확인 후 최근 30일 수집이 끝날 때까지 앱을 종료하지 않습니다.

API 키는 Windows 자격 증명 관리자에 저장됩니다. 기록 DB는 Windows의 앱 데이터 폴더 아래 `com.local.maple-guild-tracker/tracker.sqlite3`에 생성됩니다.

## 개발 명령

```powershell
npm install
npm run test
npm run build
npm run tauri dev
npm run tauri build
```

개발 중 미니 위젯만 확인하려면 빌드된 실행 파일에 `--widget` 인자를 전달합니다.

Rust 단위 테스트는 다음 명령으로 실행합니다.

```powershell
cd src-tauri
cargo test
```

## 데이터 기준

- API 원본은 NEXON Open API의 날짜별 레벨, 현재 레벨 경험치, 경험치율입니다.
- 일일 획득량은 연속된 두 날짜와 버전 고정 레벨별 필요 경험치표로 계산합니다.
- 현재 포함된 계산표는 200~299레벨을 지원합니다.
- 지원하지 않는 레벨, 경험치 역행, 누락 스냅샷은 0이 아니라 계산 불가 상태로 남습니다.
- 환산주스탯 사이트에는 접근하지 않습니다.

Data based on NEXON Open API.
