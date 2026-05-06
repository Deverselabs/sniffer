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
- Migration: `migrations/002_multichain.sql`
- Migration: `migrations/003_admin_candidates.sql`
- Migration: `migrations/004_alerting.sql`
- Seed source: `data/gambling.json`
- Seed script: `scripts/seed_gambling_contracts.py`

### Run Python tests

```bash
python -m pip install -r requirements.txt
python -m pytest
uvicorn app.main:app --reload
```

### Setup local Postgres

```bash
psql postgresql://postgres:postgres@localhost:5432/sniffer -f migrations/001_init.sql
psql postgresql://postgres:postgres@localhost:5432/sniffer -f migrations/002_multichain.sql
psql postgresql://postgres:postgres@localhost:5432/sniffer -f migrations/003_admin_candidates.sql
psql postgresql://postgres:postgres@localhost:5432/sniffer -f migrations/004_alerting.sql
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
- `TRONGRID_API_KEY` (required for TRX scans)
- `SOLANA_RPC_URL` (optional override, default mainnet-beta)
- `ADMIN_SHARED_SECRET` (required for `/api/admin/*`)
- `MORALIS_API_KEY` (required only if backend/API usage is enabled)
- `ARKHAM_API_KEY` (optional)
- `DATABASE_URL` (auto-injected from `sniffer-postgres` in blueprint)

## API endpoints

- `POST /api/v1/scan` with `{ "address": "...", "chain": "ethereum|tron|solana" }`
- `POST /api/v1/batch` with CSV upload containing `address,chain` columns (up to 500 rows)
- `POST /api/v1/webhook` with HMAC signature header `x-sniffer-signature`
- `GET /api/v1/alerts/recent` for real-time whale toasts
- `GET /api/admin/candidates` for candidate review queue + stats
- `POST /api/admin/review` with `{address, chain, action, reviewer}`
- `POST /api/admin/jobs/run` for manual cron trigger (self-learning, label scrape, verify, arkham sync)

All `/api/admin/*` endpoints require header:
- `x-admin-secret: <ADMIN_SHARED_SECRET>`

Webhook signature:
- Body HMAC SHA256 over raw request payload
- Header format: `x-sniffer-signature: sha256=<hex_digest>`

## Scheduler jobs (APScheduler, UTC)

- `03:00` daily: `self_learning_sweep`
- `05:00` weekly (Monday): `etherscan_label_scrape`
- `05:30` daily: `arkham_sync` (skips if no key)
- `06:00` daily: `verify_active_contracts`

## Docker

```bash
docker-compose up --build
```

Starts:
- API at `http://localhost:8000`
- Postgres on `localhost:5432`

Healthcheck:
- `GET /health`

## Load test

```bash
k6 run tests/load_test.js
```
