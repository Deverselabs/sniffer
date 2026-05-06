CREATE TABLE IF NOT EXISTS alerts_log (
    id BIGSERIAL PRIMARY KEY,
    address TEXT NOT NULL,
    chain TEXT NOT NULL,
    score INTEGER NOT NULL,
    route TEXT NOT NULL,
    payload JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_alerts_log_created_at ON alerts_log (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_alerts_log_score ON alerts_log (score DESC);

CREATE TABLE IF NOT EXISTS digest_email_queue (
    id BIGSERIAL PRIMARY KEY,
    address TEXT NOT NULL,
    chain TEXT NOT NULL,
    score INTEGER NOT NULL,
    payload JSONB NOT NULL,
    queued_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    processed_at TIMESTAMPTZ
);
