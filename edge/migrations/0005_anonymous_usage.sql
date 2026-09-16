-- 관리자 화면용 익명 일별 이용 현황을 최소 정보로 보관합니다.
CREATE TABLE anonymous_daily_usage (
  day TEXT NOT NULL,
  visitor_hash TEXT NOT NULL,
  first_seen INTEGER NOT NULL,
  last_seen INTEGER NOT NULL,
  session_starts INTEGER NOT NULL DEFAULT 0 CHECK(session_starts >= 0),
  PRIMARY KEY(day, visitor_hash)
);

CREATE INDEX anonymous_daily_usage_last_seen ON anonymous_daily_usage(last_seen);
