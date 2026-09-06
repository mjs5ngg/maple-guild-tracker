-- 로그인 중 계정 연결 의도를 서버에 보관합니다.
ALTER TABLE login_attempts ADD COLUMN link_user TEXT REFERENCES users(id);
