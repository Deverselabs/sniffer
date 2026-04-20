# Sniffer — Ethereum Wallet Tracker

Track ETH balance and incoming deposits for any Ethereum wallet address.

## Setup

```bash
git clone https://github.com/Deverselabs/sniffer.git
cd sniffer
npm install
cp .env.example .env
```

Add your free Etherscan API key to `.env`:
Get one at: <https://etherscan.io/apis> (free, takes 1 minute)

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
