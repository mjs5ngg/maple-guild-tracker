-- 명시적 사냥 상태와 로그인 사용자의 따라잡기 프리셋을 저장합니다.
ALTER TABLE characters ADD COLUMN is_hunting INTEGER NOT NULL DEFAULT 0 CHECK(is_hunting IN (0,1));
ALTER TABLE characters ADD COLUMN activity_decided_at TEXT;

CREATE TABLE chase_presets (
 id TEXT PRIMARY KEY,
 user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 name TEXT NOT NULL,
 period_days INTEGER NOT NULL CHECK(period_days IN (7,30)),
 ocids_json TEXT NOT NULL,
 sort_key TEXT NOT NULL CHECK(sort_key IN ('today','period','average','catchup')),
 sort_direction TEXT NOT NULL CHECK(sort_direction IN ('asc','desc')),
 created_at INTEGER NOT NULL,
 updated_at INTEGER NOT NULL
);
CREATE INDEX chase_presets_user ON chase_presets(user_id,updated_at DESC);
