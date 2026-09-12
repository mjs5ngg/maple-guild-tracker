-- 정상 범위 경험치 변화가 마지막으로 감지된 시각을 공개 상태에 보존합니다.
ALTER TABLE characters ADD COLUMN hunting_detected_at TEXT;
