# 로컬 중앙 서버 개발판

## 최신 배포 점검 — 2026-09-08

현재는 로컬 시험 서비스이며 광고를 넣을 공개 배포 준비가 끝난 상태가 아닙니다. Google 로컬 로그인과 실제 수집은 연결됐지만 도메인·HTTPS·공개 OAuth 설정·Linux 운영 전환·자동 시작/복구·정기 백업·탈퇴/개인정보 안내는 남아 있습니다. 최신 작업 상태는 루트 checklist.md를 기준으로 합니다.

웹 빌드는 루트 .env(및 Vite 모드별 환경 파일)의 PUBLIC_ORIGIN을 읽습니다. WEB_DASHBOARD_ORIGIN을 별도 지정하면 PUBLIC_ORIGIN과 같아야 합니다. WEB_DIRECT_ORIGIN은 별도 HTTPS 출처여야 하며 공개 대시보드에 로컬 개인 조회 주소를 혼합하면 빌드가 실패합니다. 브라우저 코드에는 이 두 공개 주소만 주입하며 OAuth/API/DB 비밀 값은 주입하지 않습니다.

Linux 서비스의 운영 환경은 `/etc/maple-exp/server.env`로 덮어쓸 수 있습니다. root만 읽는 600 권한으로 준비하고 DATABASE_URL·PUBLIC_ORIGIN·운영자 키·OAuth 설정을 전달합니다. 이 파일이 없으면 기존 로컬 개발 기본값이 유지됩니다. 실제 키/DB를 이전하거나 서비스를 활성화하는 작업은 별도이며, 서비스 문법 검증만으로 운영 전환 완료로 표시하지 않습니다.

현재 길드 순위의 기간 획득량은 가입 전 획득량도 포함합니다. 날짜별 길드 원본 명단은 보존하지만 경험치 합산을 제한하지 않습니다.

기존 PC·Android 앱과 별개로 실행하는 메이플 EXP 트래커 웹 개발판입니다. 기존 SQLite 기록이나 앱 설치본을 변경하지 않습니다.

## 실행

저장소 루트에서 실행합니다.

1. PostgreSQL에 전용 데이터베이스를 준비합니다.
2. .env.example을 참고해 루트 .env에 DATABASE_URL과 PUBLIC_ORIGIN을 설정합니다. 이 파일은 Git에서 제외됩니다.
3. npm run web:build
4. npm run web:server
5. http://127.0.0.1:3100 을 엽니다. 개인 직접 조회는 http://127.0.0.1:3101 입니다.

현재 작업 PC에는 공식 EDB PostgreSQL 17.11 Windows 바이너리를 .local-runtime/postgres에 내려받았고, .local-runtime/pgdata에 새 개발 전용 DB를 생성했습니다. 운영체제 서비스 등록이나 방화벽 변경은 하지 않았습니다. DB는 127.0.0.1:55432에만 바인딩합니다. 개발용 DB 암호는 공개 운영에 재사용하지 마세요.

DB 재시작은 저장소 루트에서 다음 명령으로 수행합니다.

```powershell
& '.local-runtime/postgres/pgsql/bin/pg_ctl.exe' -D '.local-runtime/pgdata' -l '.local-runtime/postgres.log' -o '-h 127.0.0.1 -p 55432' -w start
```

서버 시작 시 버전형 SQL 마이그레이션을 적용합니다. 기존 앱 DB는 대상이 아닙니다. 웹 및 개인 조회 서버는 로컬 주소에만 바인딩하므로 외부에서 접근할 수 없습니다.

## 연결에 필요한 설정

- NEXON_OPERATOR_KEY는 중앙 수집기 전용 운영자 키입니다. 설정하지 않으면 수집기를 실행하지 않습니다.
- Windows에서 NEXON_USE_WINDOWS_CREDENTIAL=1을 설정하면 사용자 승인하에 기존 앱 자격 증명 키를 메모리로 읽습니다. 실제 키를 .env로 복사하지 않습니다. 명시한 NEXON_OPERATOR_KEY가 있으면 우선합니다. Linux에는 이 방식이 적용되지 않습니다.
- cargo run --manifest-path server/Cargo.toml -- --check-operator-key 로 기존 대표 닉네임의 식별자 조회를 검증할 수 있습니다. 키나 요청 URL은 출력하지 않습니다.
- GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET
- KAKAO_CLIENT_ID / KAKAO_CLIENT_SECRET
- NAVER_CLIENT_ID / NAVER_CLIENT_SECRET
- 각 OAuth 복귀 주소는 PUBLIC_ORIGIN/auth/google/callback, /auth/kakao/callback, /auth/naver/callback 입니다.
- 발급 정보가 없는 로그인은 화면에서 비활성화됩니다. 개발용 인증 우회는 없습니다.
- 카카오는 클라이언트 시크릿을 활성화한 구성입니다. 제공자별 로컬 복귀 주소 허용 여부와 공개 전 심사는 콘솔에서 확인해야 합니다.
- 배포 주소 변경 시 WEB_DASHBOARD_ORIGIN과 WEB_DIRECT_ORIGIN을 지정하고 웹을 다시 빌드합니다. 개인 키 출처에는 광고·분석 스크립트를 넣지 않습니다.
- 소셜 로그인 연결은 기존 로그인 세션과 제공자 인증을 모두 확인합니다. 이메일 자동 병합은 하지 않습니다. 계정 관리에서 ‘탈퇴’를 직접 입력하면 본인 설정·연결·전체 세션을 삭제하며 공용 기록은 보존합니다. 개별 연결 해제는 아직 없고 제공자 사이트 승인 철회·개인 키 출처의 키 삭제는 별도입니다.

개인 넥슨 키는 별도 웹 출처의 로컬 저장소에 선택적으로 기억합니다. 서버 업로드 API는 제공하지 않습니다. 브라우저 비밀번호 관리자 동작 자체를 보장하지는 않습니다. 개인 결과는 브라우저 메모리에만 반영됩니다.

## 구현된 동작

- PostgreSQL 계정·소셜 ID·해시 세션·대표·즐겨찾기 분리.
- Google·카카오·네이버 인증 코드 교환 및 제공자 프로필 식별. 상태 토큰 1회 사용과 브라우저 쿠키 결합.
- 168시간 내 활성 사용자 필요 대상의 합집합 수집. 다른 활성 사용자의 길드원·대표·즐겨찾기는 수집 유지.
- 서버 프로세스 간 PostgreSQL advisory lock, 15분 주기와 중복 실행 방지.
- 직렬 API 요청과 429/서버 장애 재시도. 최신 수집 후 주기당 최대 300개 과거 스냅샷 보충.
- 최근 30일 보충과 원본 보존. 역사 길드 가입일별 랭킹은 아직 구현하지 않았습니다.
- 오늘·7일·30일, 전체 경험치/기간 획득 정렬, 즐겨찾기 탭, 대표 성장 그래프.
- 자정 기준점 부족 시 근처 서버 관측값 사용 및 추정 안내.
- 개인 개발키 대표 조회, 서비스키 현재 길드와 즐겨찾기 조회. 조회 중 잠금 및 완료 후 60초 제한.
- 필수 출처 표기, 키 종류·168시간 정책·자정 경계 안내.

## 검증

### 현재 운영 상태 — 2026-09-09

별도 내부 SSD의 `D:\MapleEXPBackups`로 정상 백업을 복사하는 서비스 후처리도 활성화했습니다. 현재 사용자/SYSTEM/관리자만 접근하도록 ACL을 설정했고 서비스 실행 성공과 SHA-256 일치를 확인했습니다. 기존 파일을 자동 삭제하지 않으므로 용량 관리가 필요합니다. 같은 PC의 다른 디스크 보관이며 외부 장비 보관은 아닙니다.

운영 백업 서비스 첫 생성본을 별도 DB에 복원하는 시험도 통과했습니다. 사용자1·소셜연결1·스냅샷11,511·날짜별길드31건을 확인했습니다. 같은 디스크 안의 백업/검증 DB이므로 별도 장비나 디스크로의 보관은 여전히 필요합니다.

Linux 전환 후 실제 수집217은 369명 성공·실패0으로 완료했습니다. Windows 작업 스케줄러의 `Maple EXP Linux Runtime`은 현재 사용자 로그인 시 숨김 명령으로 WSL을 유지하며 수동 실행 Running을 확인했습니다. 로그인 전 무인 시작이나 실제 재부팅 검증은 아직 아닙니다. 작업을 중지하면 WSL이 유휴 종료될 수 있으므로 운영 중 임의로 중지하지 마세요.

실제 서버는 WSL Ubuntu의 `maple-exp.service`로 전환했습니다. 운영 DB는 PostgreSQL 17의 `maple_live_20260909_0235`(5433), 설정은 root 전용 `/etc/maple-exp/server.env`입니다. Windows 원본 DB는 보존하지만 최신 데이터는 Linux에 쌓이므로 이전 Windows 서버를 그대로 켜면 안 됩니다. 정기 백업은 활성화했고 수동 첫 실행도 성공했습니다. 아래의 미활성화 설명은 전환 전 준비 이력입니다. Windows 부팅 시 WSL 자동 실행·재부팅 복구와 Google 실제 재로그인은 아직 남아 있습니다.

### 정기 백업 활성화 전 확인

`server/deploy/maple-exp-backup.service`와 `.timer`는 매일 04:30 KST에 백업하며, 중지 중 놓친 실행은 재시작 후 보충합니다. 현재 운영 데이터가 Windows에 있으므로 아직 활성화하지 않습니다. Linux 운영 DB 이전·복원 확인 후 두 파일을 `/etc/systemd/system/`에 설치하고 `systemctl enable --now maple-exp-backup.timer`로 활성화합니다.

서비스는 `/var/lib/maple-exp-backups`만 쓰기 가능한 상태 디렉터리로 사용하며 디렉터리 700·백업 파일 600 권한을 사용합니다. DB 설정은 root 소유 600 권한의 `/etc/maple-exp/backup.env`에서 PGHOST/PGDATABASE/PGUSER/PGPASSFILE로 전달합니다. 비밀을 명령 인수에 넣지 않습니다. 성공한 백업도 실제 복원 시험을 정기적으로 해야 하며, 다른 디스크 보관·용량 경보는 추가 작업입니다. 자동 백업 삭제는 수행하지 않습니다.

### Linux 서비스와 백업

`scripts/test-linux-service.sh`는 root로 실행하는 개발용 복구 시험입니다. 비밀번호 없는 검증 DB의 Unix 소켓 DATABASE_URL을 인수로 받으며, 기존 `maple-exp-rehearsal` 서비스가 있으면 거부합니다. 3200/3201의 키 없는 임시 서비스를 실행해 주 프로세스를 강제 종료하고 새 PID와 DB 연결 복구를 확인한 뒤 시험 서비스를 중지합니다. 해당 이름과 포트가 비어 있고 Linux 작업본에 운영 키를 저장하지 않은 환경에서만 실행하세요. 2026-09-08 복원 DB에서 통과했으며 Windows 부팅 연동·운영 서비스 활성화·실제 로그인 검증과는 별개입니다.

병행 검증 시 `SERVER_PORT=3200 DIRECT_PORT=3201 PUBLIC_ORIGIN=http://127.0.0.1:3200`처럼 포트를 지정할 수 있습니다. 기본값은 3100/3101이고 항상 127.0.0.1에만 바인딩합니다. 두 포트는 서로 달라야 하고 1~65535 범위여야 합니다. 실제 화면 조작을 검증하려면 웹도 해당 WEB_DASHBOARD_ORIGIN/WEB_DIRECT_ORIGIN으로 별도 빌드해야 합니다. 운영 키를 제공하지 않으면 복원 DB에서 중복 수집하지 않습니다.

복원은 `bash scripts/restore-linux.sh /보호된/경로/backup.dump 새_DB명`으로 수행합니다. 기존 DB가 있으면 즉시 실패하며, 새 DB에 단일 트랜잭션으로 복원합니다. 실패한 새 DB와 원본 파일은 자동 삭제하지 않습니다. 복원 완료는 서비스 전환 완료가 아니므로 기록 수·대표/즐겨찾기·로그인·수집을 확인한 뒤 연결 설정을 바꾸어야 합니다. 이전 DB와 서버 설정은 되돌리기용으로 보존합니다.

현재 Windows 운영 DB와 Linux 이전 대상은 PostgreSQL 17.11입니다. Linux 17/main은 5433, 기존 16/main은 5432에서 병행 실행합니다. 17을 대상으로 할 때 `PGPORT=5433`과 DATABASE_URL의 `port=5433`을 명시해야 합니다. 기존 서비스 기본값은 아직 16 개발 DB를 가리키므로 운영 전환 전에 보호된 환경 파일에서 변경해야 합니다.

2026-09-08 Windows 실제 백업을 17의 별도 검증 DB `maple_rehearsal_20260908_220111`에 복원하여 스냅샷 11,113건을 확인했습니다. 표본 백업/복원과 서버 테스트 18개도 17에서 통과했습니다. 실제 서비스 연결과 비밀 키는 이전하지 않았으며, 최종 전환에는 새로운 백업과 앱 수준 검증이 필요합니다. 검증용 복사본에도 계정 자료가 있으므로 공개하거나 Git에 포함하지 않습니다.

Windows와 Linux 모두 `npm run web:build`로 두 웹 화면을 빌드합니다. 기존 PowerShell 빌드 파일도 같은 Node 스크립트를 호출합니다.

`server/deploy/maple-exp.service`는 `/home/mapledev/maple-guild-tracker`의 release 서버를 실행하는 systemd 구성입니다. 비정상 종료 시 10초 후 재시작하며 일반 사용자·읽기 전용 파일시스템으로 실행합니다. 서비스 문법 검증만 수행했고 아직 설치·활성화하지 않았습니다. 실제 재시작 검증과 운영 이전은 남아 있습니다.

운영 전환 시 기존 서버 중지, DB 이전·검증과 비밀 설정을 먼저 완료해야 합니다. 다음 명령은 전환 시 사용할 절차이며 지금 자동 실행하지 않습니다.

```bash
cargo build --release --manifest-path server/Cargo.toml
npm run web:build
sudo install -m 644 server/deploy/maple-exp.service /etc/systemd/system/maple-exp.service
sudo systemctl daemon-reload
sudo systemctl enable --now maple-exp
```

현재 서비스 설정은 로컬 Linux DB만 지정합니다. 운영자 키·OAuth 설정이 없으면 수집·로그인은 비활성화됩니다. WSL의 systemd 서비스 활성화는 Windows 부팅 시 WSL 자체의 자동 기동까지 보장하지 않습니다. 외부 공개·Windows 부팅 연동은 별도 단계입니다.

Linux 작업본에서 `bash scripts/backup-linux.sh`로 `.local-runtime/backups`에 PostgreSQL custom-format 백업을 만듭니다. Unix 소켓과 현재 사용자 인증을 사용하고, 파일 권한은 600입니다. 비밀이 담길 수 있으므로 Git에 포함하지 않습니다. 백업 실패 파일은 `.partial`로 남고, 정상 백업은 자동 삭제하지 않습니다. 다른 DB를 대상으로 할 때는 libpq의 `PGHOST`, `PGDATABASE`, `PGUSER` 설정을 사용합니다.

`bash scripts/test-linux-backup.sh`는 신규 임시 DB 두 개로 한글과 큰 정수를 실제 복원하고 파일 권한, 기존 대상과 잘못된 백업 거부를 검사합니다. 이 테스트에서 생성한 DB만 정리하며 표본 백업 파일은 남깁니다. 정기 백업 구성은 준비했지만 아직 활성화하지 않았고 다른 디스크 보관과 보관 기간 정책도 미적용입니다.

### WSL2 Ubuntu 개발 환경

Ubuntu 24.04에서 root로 `bash scripts/setup-linux.sh`를 실행하면 개발 도구와 별도 `mapledev` 계정·PostgreSQL DB를 준비합니다. Rust는 해당 사용자로 공식 rustup을 설치합니다. Windows DB나 자격 증명은 복사하지 않습니다.

현재 Linux 작업본은 `/home/mapledev/maple-guild-tracker`입니다. 해당 경로에서 다음 명령으로 검증할 수 있습니다.

```bash
export DATABASE_URL='postgresql:///maple_exp?host=/var/run/postgresql&user=mapledev'
cargo test --manifest-path server/Cargo.toml -- --include-ignored
npm ci
npm test
npx tsc --noEmit
npx vite build --config vite.web.config.ts
WEB_DIRECT=1 npx vite build --config vite.web.config.ts
cargo run --manifest-path server/Cargo.toml
```

Linux 테스트 서버도 3100·3101 포트를 사용하므로 Windows 서버와 동시에 실행하지 않습니다. Linux는 Windows 자격 증명에 접근하지 않으며, 운영 키와 소셜 인증 설정이 없는 상태에서는 실제 수집·로그인은 비활성화됩니다. 개발 환경 설치는 운영 서버 자동 시작이나 운영 DB 이전을 의미하지 않습니다.

```text
npm test
npm run web:build
cargo test --manifest-path server/Cargo.toml
cargo clippy --manifest-path server/Cargo.toml --all-targets -- -D warnings
```

실제 DB 통합 테스트는 DATABASE_URL을 개발용 PostgreSQL로 설정한 상태에서 다음처럼 실행합니다. sqlx 테스트 도구가 격리 DB를 만들고 정리하므로 테스트 DB 생성 권한이 필요합니다.

```text
cargo test --manifest-path server/Cargo.toml -- --ignored
```

## 남은 검증과 공개 전 작업

- 실제 제공자 등록 정보로 세 가지 로그인과 계정 연결 검증.
- 실제 운영자 키로 길드 단위 수집, 실패 재개, 호출량·장시간 부하 측정.
- 실제 개인 키로 브라우저 CORS 조회·저장·새로고침 결과 검증. 현재는 HTTP 사전 요청만 검증한 상태입니다.
- 보충 작업은 DB 큐에 보관하고 캐릭터별로 공정하게 배분합니다. 실패는 30분~6시간 지연 재시도합니다. 실제 대규모 처리량 측정은 남아 있습니다.
- 동일 OCID 닉네임 변경은 이름 이력·원본을 보존하며 대표·즐겨찾기를 추적합니다. 다른 OCID 이름 충돌은 자동 병합하지 않습니다. 날짜별 길드 가입·탈퇴 순위 이관은 남아 있습니다.
- 원본 장기 보관량 측정 및 승인된 보관 정책 결정. 현재 자동 원본 삭제는 없습니다.
- Android/PC의 서버 연결 전환, 위젯 활동 연결은 후속 단계입니다.
- 광고 네트워크 등록 정보 연결과 도메인·HTTPS·백업/복구 공개 환경 설정.
- WebMCP 서버 상태 조회는 기능 감지 방식으로 추가했으나 지원 브라우저 실행 검증은 하지 않았습니다.

공식 근거.
- https://www.enterprisedb.com/download-postgresql-binaries?lang=en
- https://docs.rs/axum/latest/axum/
- https://docs.rs/sqlx/latest/sqlx/
- https://developers.google.com/identity/openid-connect/openid-connect
- https://developers.kakao.com/docs/ko/kakaologin/rest-api
- https://developers.naver.com/docs/login/api/api.md
