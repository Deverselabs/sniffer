# Sniffer — Ethereum Wallet Tracker

Track ETH balance and incoming deposits for any Ethereum wallet address.

## Setup

```bash
git clone https://github.com/Deverselabs/sniffer.git
cd sniffer
npm install
cp .env.example .env
```

Add your API keys to `.env`:
- Etherscan: <https://etherscan.io/apis>
- Moralis: <https://moralis.io/>
- Arkham (optional): <https://arkhamintelligence.com/>

Canonical naming strategy:
- Use only `ETHERSCAN_API_KEY` across environments.
- Frontend build receives this key at build time (Render build command maps it to Vite).

```bash
npm run dev
```

## Adding a new blockchain

1. Create `src/api/solana.ts` (or whichever chain)
2. Export: `async function fetchWalletData(address, apiKey): Promise<WalletData>`
3. Wire into `src/api/index.ts`
4. Add a chain selector UI component

The `WalletData` and `Transaction` interfaces stay the same across all chains.

## Folder structure

`src/api/`         — data fetching adapters (one per chain)  
`src/components/`  — UI components  
`src/hooks/`       — useWalletData state + fetch logic  
`src/utils/`       — formatting helpers

## Backend scoring + database

This repo now includes a Python scoring engine and Postgres schema used for 10-tier scoring.

- Python scorer: `app/services/scorer.py`
- Tier config: `app/services/config.py`
- Migration: `migrations/001_init.sql`
- Seed source: `data/gambling.json`
- Seed script: `scripts/seed_gambling_contracts.py`

### Run Python tests

```bash
python -m pip install -r requirements.txt
python -m pytest
```

### Setup local Postgres

```bash
psql postgresql://postgres:postgres@localhost:5432/sniffer -f migrations/001_init.sql
python scripts/seed_gambling_contracts.py
```

Expected seed result: 13 records imported (7 verified, 6 candidate).

## Render deployment (single app + separate DB instance)

`render.yaml` is configured to keep your existing static app and add Postgres as a separate managed instance:

- Service `sniffer` (static) keeps running as before.
- New database `sniffer-postgres` is provisioned separately.
- `DATABASE_URL` is injected from the Render database connection string.
- Frontend build uses `ETHERSCAN_API_KEY` (no duplicated key names required in Render env).

Required env vars in Render service:
- `ETHERSCAN_API_KEY` (required)
- `MORALIS_API_KEY` (required only if backend/API usage is enabled)
- `ARKHAM_API_KEY` (optional)
- `DATABASE_URL` (auto-injected from `sniffer-postgres` in blueprint)
