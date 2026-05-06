CREATE TABLE IF NOT EXISTS contract_candidates (
    id BIGSERIAL PRIMARY KEY,
    address TEXT NOT NULL,
    chain TEXT NOT NULL CHECK (chain IN ('ethereum', 'tron', 'solana', 'all')),
    source TEXT NOT NULL,
    confidence NUMERIC(4,3) NOT NULL DEFAULT 0.500 CHECK (confidence >= 0 AND confidence <= 1),
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'needs_more')),
    tx_pattern_summary TEXT,
    customer_overlap_count INTEGER NOT NULL DEFAULT 0,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    discovered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    reviewed_by TEXT,
    reviewed_at TIMESTAMPTZ,
    review_note TEXT,
    UNIQUE (address, chain, source)
);

CREATE INDEX IF NOT EXISTS idx_contract_candidates_status ON contract_candidates (status);
CREATE INDEX IF NOT EXISTS idx_contract_candidates_discovered_at ON contract_candidates (discovered_at DESC);

CREATE TABLE IF NOT EXISTS admin_review_log (
    id BIGSERIAL PRIMARY KEY,
    address TEXT NOT NULL,
    chain TEXT NOT NULL,
    action TEXT NOT NULL CHECK (action IN ('approve', 'reject', 'needs_more')),
    reviewer TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    note TEXT
);
