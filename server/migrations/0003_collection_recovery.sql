-- 과거 보충 작업과 캐릭터 이름 변경 및 동기화 종료 상태를 보존합니다.
CREATE TABLE backfill_jobs (
 ocid TEXT NOT NULL REFERENCES characters(ocid),
 date DATE NOT NULL,
 attempts INTEGER NOT NULL DEFAULT 0,
 next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 last_attempt_at TIMESTAMPTZ,
 PRIMARY KEY(ocid,date)
);
CREATE INDEX backfill_due ON backfill_jobs(next_attempt_at);
CREATE TABLE backfill_cursors (
 ocid TEXT PRIMARY KEY REFERENCES characters(ocid),
 last_served TIMESTAMPTZ NOT NULL
);
CREATE TABLE character_names (
 ocid TEXT NOT NULL REFERENCES characters(ocid),
 name TEXT NOT NULL,
 first_seen TIMESTAMPTZ NOT NULL,
 last_seen TIMESTAMPTZ NOT NULL,
 PRIMARY KEY(ocid,name)
);
INSERT INTO character_names SELECT ocid,name,observed_at,observed_at FROM characters;
ALTER TABLE sync_runs ADD COLUMN status TEXT NOT NULL DEFAULT 'running';
UPDATE sync_runs SET status='completed' WHERE finished_at IS NOT NULL;
