-- 신규 기기 및 설정 변경의 시간당 요청 예산을 보관합니다.
CREATE TABLE request_budgets (
 bucket TEXT PRIMARY KEY,
 started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 used INTEGER NOT NULL CHECK (used > 0)
);
