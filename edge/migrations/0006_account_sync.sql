-- 신규 Android 앱 로그인 종류를 허용하고 즐겨찾기를 사용자 1행 JSON으로 합쳐 쓰기 행 수를 줄입니다.
-- login_attempts는 10분짜리 임시 행만 담으므로 다시 만들어 CHECK 제약을 교체합니다.
DROP TABLE login_attempts;
CREATE TABLE login_attempts (
 state_hash TEXT PRIMARY KEY,
 browser_hash TEXT NOT NULL,
 expires_at INTEGER NOT NULL,
 link_user TEXT REFERENCES users(id) ON DELETE CASCADE,
 client_kind TEXT NOT NULL DEFAULT 'web' CHECK(client_kind IN ('web','android','android-v2')),
 pkce_challenge TEXT
);

ALTER TABLE users ADD COLUMN favorites_json TEXT NOT NULL DEFAULT '[]';
UPDATE users SET favorites_json=(
 SELECT json_group_array(name) FROM (SELECT name FROM favorites WHERE favorites.user_id=users.id ORDER BY name)
) WHERE EXISTS (SELECT 1 FROM favorites WHERE favorites.user_id=users.id);
