# Cloudflare 공개부

공개 사용자 화면과 호환 API는 Workers 정적 자산과 D1을 같은 `workers.dev` 출처에서 제공합니다. NEXON 운영자 키와 원본 응답은 이 프로젝트에 저장하거나 전송하지 않습니다.

로컬 검증은 다음 순서로 실행합니다.

```text
npm run web:build
npm run edge:migrate:local
npm run edge:typecheck
npm test
npm run edge:dev
```

내부 수집 요청은 `x-maple-timestamp`, `x-maple-batch-id`, `x-maple-signature` 헤더를 사용합니다. 서명 원문은 `{timestamp}.{batchId}.{rawBody}`이고 알고리즘은 HMAC-SHA256의 64자리 소문자 16진수입니다. 시각 차이가 5분을 넘거나 배치가 재사용되면 거부합니다. `GET /internal/v1/subscriptions`는 빈 본문으로 같은 방식으로 서명합니다.

원격 배포 전에는 Cloudflare에서 D1을 생성하고 반환된 UUID로 `wrangler.jsonc`의 임시 UUID를 교체합니다. 그다음 D1 마이그레이션을 원격 적용하고 세 비밀을 대화형 명령으로 등록합니다. 비밀 값은 저장소나 셸 기록에 넣지 않습니다.

```text
npx wrangler d1 create maple-exp-public
npx wrangler d1 migrations apply maple-exp-public --remote --config edge/wrangler.jsonc
npx wrangler secret put INGEST_HMAC_SECRET --config edge/wrangler.jsonc
npx wrangler secret put GOOGLE_CLIENT_ID --config edge/wrangler.jsonc
npx wrangler secret put GOOGLE_CLIENT_SECRET --config edge/wrangler.jsonc
npm run edge:deploy
```

Google OAuth 승인된 리디렉션 URI에는 실제 `https://...workers.dev/auth/google/callback`을 추가해야 합니다. 유료 플랜이나 자동 유료 전환은 구성하지 않습니다.
