-- Cloudflare 전송 실패 원인을 비밀 정보 없이 운영 화면에서 확인합니다.
ALTER TABLE edge_outbox ADD COLUMN last_error TEXT;
