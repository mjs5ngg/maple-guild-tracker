# 비로그인 베타·광고·무료 주소 검토

2026-09-09 확인. 실제 가입·심사·배포는 하지 않았다.

## 확정 범위

로그인 없이 모든 조회와 설정, 개인 새로고침을 제공한다. 로그인은 기기 간 설정 동기화에만 필요하다. 개인 키는 기기 밖의 중앙 서버에 저장하지 않는다. 비로그인 사용자도 서버 자동 수집 대상 등록이 필요하므로 로컬 설정과 익명 구독을 구분한다. 로그인 전 설정을 기존 계정에 자동 덮어쓰기 하지 않는다.

## 광고 후보

- 카카오 AdFit. 한국어 웹 배너의 우선 검토 후보. 공식 웹 매체 광고 지원은 확인했으나 본 서비스의 승인·수익률은 미확정. https://adfit.kakao.com/info 및 https://adfit.kakao.com/web/html/use_kakao.html
- 직접 후원 배너. 게임 이용자와 관련 있는 광고주와 직접 계약하는 방식. 광고망 승인 대신 광고주 확보·표시·계약 관리가 필요하며 현재 광고주나 매출은 없다. 이는 사업 제안이지 검증된 수익 경로가 아니다.
- Media.net. 퍼블리셔 프로그램과 ads.txt 요건 확인. 한국어 게임 유틸리티에 대한 승인과 광고 수요는 미확인하여 후순위. https://www.media.net/ads/publisher-program/ 및 https://www.media.net/legal/inventorypolicies
- 개인 키 전용 출처에는 제3자 광고/분석 스크립트를 넣지 않는다. 데이터 자동 갱신과 광고 재요청은 분리한다. 광고망을 추가해도 트래픽 부족 자체가 해결되지는 않는다.

## 도메인 구매 없는 주소

- Cloudflare Pages의 pages.dev. 프런트엔드/개인 조회 정적 파일에 적합한 후보다. 이것만으로 로컬 Rust/PostgreSQL 서버가 외부 연결되지는 않는다. 별도의 고정 API 연결 경로를 검증해야 한다. https://developers.cloudflare.com/pages/configuration/custom-domains/
- workers.dev. 도메인 없이 주소 발급 가능하나 Cloudflare는 중요 운영 서비스에 사용자 도메인을 권장한다. 기존 Rust 서버의 단순 업로드 대체가 아니며, 프록시도 도달 가능한 원본 서버가 필요하다. https://developers.cloudflare.com/workers/configuration/routing/workers-dev/
- ngrok 무료 할당 도메인. 자체 도메인 구매 없이 로컬 서버 연결 가능. 월 HTTP 20,000회 제한과 하나의 할당 도메인 때문에 현재 매분 조회와 두 출처 구성에 바로 맞지 않는다. 소규모 기능 시험 후보이지 무제한 운영 해법이 아니다. https://ngrok.com/docs/pricing-limits/free-plan-limits
- Cloudflare Quick Tunnel. 임시 기능 시험 전용이며 정식 고정 주소로 채택하지 않는다. https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/do-more-with-tunnels/trycloudflare/
- Render 무료 웹 서비스. 15분 무요청 시 중지하므로 24시간 수집기의 직접 대체로 부적합하다. https://render.com/docs/free

## 다음 검증

무료 프런트 주소와 자체 서버 HTTPS 연결을 구분하여 조사한다. 무료 주소가 존재한다는 사실만으로 광고 승인·OAuth·개인 키 CORS·운영 안정성이 확보됐다고 하지 않는다. 포트 공개/네트워크 접근 확대·외부 가입은 영향 범위 확인 후 진행한다.

## 첫 성능 변경

대시보드 현재값·과거값·기준값을 웹 Basic의 8개 필드로 제한한다. 원본 DB, 정확한 정수, 날짜별 소속 계산은 변경하지 않는다. 이는 전송량 경감의 첫 단계이며 DB 조회량 감소나 실측 절감률을 의미하지 않는다. 목록/이력 분리·버전 조회·병렬 수집은 미완료다.
