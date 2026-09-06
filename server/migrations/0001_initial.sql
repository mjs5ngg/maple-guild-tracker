-- 사용자별 구독과 공용 수집 기록을 분리하여 보관합니다.
CREATE TABLE users (
 id TEXT PRIMARY KEY,
 last_active TIMESTAMPTZ NOT NULL DEFAULT now(),
 primary_name TEXT NOT NULL DEFAULT ''
);
CREATE TABLE identities (
 provider TEXT NOT NULL,
 subject TEXT NOT NULL,
 user_id TEXT NOT NULL REFERENCES users(id),
 PRIMARY KEY(provider, subject),
 UNIQUE(user_id, provider)
);
CREATE TABLE sessions (
 token_hash TEXT PRIMARY KEY,
 user_id TEXT NOT NULL REFERENCES users(id),
 expires_at TIMESTAMPTZ NOT NULL
);
CREATE TABLE login_attempts (
 state_hash TEXT PRIMARY KEY,
 provider TEXT NOT NULL,
 browser_hash TEXT NOT NULL,
 expires_at TIMESTAMPTZ NOT NULL
);
CREATE TABLE favorites (
 user_id TEXT NOT NULL REFERENCES users(id),
 name TEXT NOT NULL,
 PRIMARY KEY(user_id,name)
);
CREATE TABLE characters (
 ocid TEXT PRIMARY KEY,
 name TEXT NOT NULL UNIQUE,
 guild_key TEXT,
 basic JSONB NOT NULL,
 observed_at TIMESTAMPTZ NOT NULL
);
CREATE TABLE guilds (
 guild_key TEXT PRIMARY KEY,
 world TEXT NOT NULL,
 name TEXT NOT NULL,
 observed_at TIMESTAMPTZ NOT NULL
);
CREATE TABLE guild_members (
 guild_key TEXT NOT NULL REFERENCES guilds(guild_key),
 name TEXT NOT NULL,
 PRIMARY KEY(guild_key,name)
);
CREATE TABLE daily_snapshots (
 ocid TEXT NOT NULL REFERENCES characters(ocid),
 date DATE NOT NULL,
 basic JSONB NOT NULL,
 PRIMARY KEY(ocid,date)
);
CREATE TABLE observations (
 ocid TEXT NOT NULL REFERENCES characters(ocid),
 observed_at TIMESTAMPTZ NOT NULL,
 basic JSONB NOT NULL,
 PRIMARY KEY(ocid,observed_at)
);
CREATE TABLE sync_runs (
 id BIGSERIAL PRIMARY KEY,
 started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 finished_at TIMESTAMPTZ,
 succeeded INTEGER NOT NULL DEFAULT 0,
 failed INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX sessions_expiry ON sessions(expires_at);
CREATE INDEX observations_time ON observations(observed_at);
