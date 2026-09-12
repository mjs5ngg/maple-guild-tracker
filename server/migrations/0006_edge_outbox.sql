-- Cloudflare 변경분과 전송 실패 배치를 로컬에서 손실 없이 보관합니다.
CREATE TABLE edge_export_state (
 kind TEXT NOT NULL,
 item_key TEXT NOT NULL,
 checksum TEXT NOT NULL,
 queued_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 PRIMARY KEY(kind,item_key)
);
CREATE TABLE edge_outbox (
 slot SMALLINT PRIMARY KEY CHECK(slot=1),
 batch_id TEXT NOT NULL UNIQUE,
 body JSONB NOT NULL,
 attempts INTEGER NOT NULL DEFAULT 0,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 last_attempt_at TIMESTAMPTZ
);
