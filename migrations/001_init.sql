CREATE TABLE IF NOT EXISTS gambling_contracts (
    id SERIAL PRIMARY KEY,
    address TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    chain TEXT NOT NULL DEFAULT 'ethereum',
    status TEXT NOT NULL CHECK (status IN ('verified', 'candidate', 'deprecated')),
    confidence NUMERIC(4,3) NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
    source TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_gambling_contracts_address
    ON gambling_contracts (address);

CREATE TABLE IF NOT EXISTS wallet_scores (
    id BIGSERIAL PRIMARY KEY,
    wallet_address TEXT NOT NULL,
    chain TEXT NOT NULL DEFAULT 'ethereum',
    total_score INTEGER NOT NULL CHECK (total_score >= 0 AND total_score <= 100),
    tier_breakdown JSONB NOT NULL,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    scanned_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_wallet_scores_wallet_address
    ON wallet_scores (wallet_address);

CREATE TABLE IF NOT EXISTS scan_log (
    id BIGSERIAL PRIMARY KEY,
    wallet_address TEXT NOT NULL,
    chain TEXT NOT NULL DEFAULT 'ethereum',
    scan_status TEXT NOT NULL CHECK (scan_status IN ('success', 'error', 'partial')),
    request_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    response_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    error_message TEXT,
    duration_ms INTEGER,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_scan_log_wallet_created_at
    ON scan_log (wallet_address, created_at DESC);
