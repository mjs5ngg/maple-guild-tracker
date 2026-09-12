-- Android 시스템 브라우저 로그인용 PKCE 시도와 일회용 교환 코드를 저장합니다.
ALTER TABLE login_attempts ADD COLUMN client_kind TEXT NOT NULL DEFAULT 'web' CHECK(client_kind IN ('web','android'));
ALTER TABLE login_attempts ADD COLUMN pkce_challenge TEXT;

CREATE TABLE android_exchange_codes (
 code_hash TEXT PRIMARY KEY,
 user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 pkce_challenge TEXT NOT NULL,
 expires_at INTEGER NOT NULL
);
CREATE INDEX android_exchange_expiry ON android_exchange_codes(expires_at);
