-- 공개 서비스의 정규화 상태와 사용자 설정 및 서명 배치를 저장합니다.
PRAGMA foreign_keys = ON;

CREATE TABLE users (id TEXT PRIMARY KEY,last_active INTEGER NOT NULL,primary_name TEXT NOT NULL DEFAULT '');
CREATE TABLE identities (provider TEXT NOT NULL,subject TEXT NOT NULL,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,PRIMARY KEY(provider,subject),UNIQUE(user_id,provider));
CREATE TABLE sessions (token_hash TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,expires_at INTEGER NOT NULL,kind TEXT NOT NULL CHECK(kind IN ('device','account')));
CREATE TABLE login_attempts (state_hash TEXT PRIMARY KEY,browser_hash TEXT NOT NULL,expires_at INTEGER NOT NULL,link_user TEXT REFERENCES users(id) ON DELETE CASCADE);
CREATE TABLE favorites (user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,name TEXT NOT NULL,PRIMARY KEY(user_id,name));
CREATE TABLE characters (ocid TEXT PRIMARY KEY,name TEXT NOT NULL UNIQUE,world_name TEXT,character_class TEXT,level INTEGER NOT NULL,exp TEXT NOT NULL,exp_rate REAL NOT NULL,guild_name TEXT,guild_key TEXT,image_url TEXT,observed_at TEXT NOT NULL);
CREATE TABLE guilds (guild_key TEXT PRIMARY KEY,world_name TEXT NOT NULL,name TEXT NOT NULL,observed_at TEXT NOT NULL);
CREATE TABLE guild_members (guild_key TEXT NOT NULL REFERENCES guilds(guild_key) ON DELETE CASCADE,name TEXT NOT NULL,PRIMARY KEY(guild_key,name));
CREATE TABLE guild_daily_members (guild_key TEXT NOT NULL,date TEXT NOT NULL,name TEXT NOT NULL,PRIMARY KEY(guild_key,date,name));
CREATE TABLE daily_snapshots (ocid TEXT NOT NULL,date TEXT NOT NULL,name TEXT NOT NULL,world_name TEXT,character_class TEXT,level INTEGER NOT NULL,exp TEXT NOT NULL,exp_rate REAL NOT NULL,guild_name TEXT,image_url TEXT,PRIMARY KEY(ocid,date));
CREATE TABLE today_baselines (ocid TEXT NOT NULL,date TEXT NOT NULL,name TEXT NOT NULL,level INTEGER NOT NULL,exp TEXT NOT NULL,exp_rate REAL NOT NULL,PRIMARY KEY(ocid,date));
CREATE TABLE sync_state (id INTEGER PRIMARY KEY CHECK(id=1),status TEXT NOT NULL,started_at TEXT,finished_at TEXT,succeeded INTEGER NOT NULL DEFAULT 0,failed INTEGER NOT NULL DEFAULT 0);
CREATE TABLE ingest_batches (batch_id TEXT PRIMARY KEY,sent_at INTEGER NOT NULL,accepted_at INTEGER NOT NULL);
CREATE TABLE request_budgets (bucket TEXT PRIMARY KEY,started_at INTEGER NOT NULL,used INTEGER NOT NULL CHECK(used>0));

CREATE INDEX sessions_expiry ON sessions(expires_at);
CREATE INDEX users_activity ON users(last_active);
CREATE INDEX characters_guild ON characters(guild_key);
CREATE INDEX daily_snapshots_date ON daily_snapshots(date);
CREATE INDEX guild_daily_members_date ON guild_daily_members(guild_key,date);
CREATE INDEX ingest_batches_accepted ON ingest_batches(accepted_at);
