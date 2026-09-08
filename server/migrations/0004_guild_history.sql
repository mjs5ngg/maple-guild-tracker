-- 완료일별 길드 원본 명단과 재시작 가능한 보충 작업을 보존합니다.
CREATE TABLE guild_daily_snapshots (
 guild_key TEXT NOT NULL REFERENCES guilds(guild_key),
 date DATE NOT NULL,
 basic JSONB NOT NULL,
 collected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 PRIMARY KEY(guild_key,date)
);
CREATE TABLE guild_history_jobs (
 guild_key TEXT NOT NULL REFERENCES guilds(guild_key),
 date DATE NOT NULL,
 attempts INTEGER NOT NULL DEFAULT 0,
 next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 PRIMARY KEY(guild_key,date)
);
