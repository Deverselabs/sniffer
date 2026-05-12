-- Durable cache for whale-network BFS wallet scans (score + neighbor list).
-- Invalidated when activity tip (fingerprint / tx hash / block) changes or row exceeds TTL at read time.

CREATE TABLE IF NOT EXISTS whale_wallet_scan_cache (
    chain TEXT NOT NULL,
    address_key TEXT NOT NULL,
    tx_window TEXT NOT NULL,
    fingerprint TEXT NOT NULL,
    tip_tx_hash TEXT NOT NULL DEFAULT '',
    tip_ts BIGINT NOT NULL DEFAULT 0,
    tip_block BIGINT,
    score INTEGER NOT NULL CHECK (score >= 0 AND score <= 1000),
    neighbors JSONB NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (chain, address_key, tx_window)
);

CREATE INDEX IF NOT EXISTS idx_whale_wallet_scan_cache_updated_at
    ON whale_wallet_scan_cache (updated_at DESC);
