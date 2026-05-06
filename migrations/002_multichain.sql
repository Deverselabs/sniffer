ALTER TABLE gambling_contracts
    ADD COLUMN IF NOT EXISTS chain TEXT;

UPDATE gambling_contracts
SET chain = 'ethereum'
WHERE chain IS NULL OR chain = '';

ALTER TABLE gambling_contracts
    ALTER COLUMN chain SET DEFAULT 'ethereum';

ALTER TABLE gambling_contracts
    ALTER COLUMN chain SET NOT NULL;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'gambling_contracts_chain_check'
    ) THEN
        ALTER TABLE gambling_contracts
            ADD CONSTRAINT gambling_contracts_chain_check
            CHECK (chain IN ('ethereum', 'tron', 'solana', 'all'));
    END IF;
END
$$;
