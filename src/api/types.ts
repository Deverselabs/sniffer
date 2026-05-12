export type Chain = "ethereum" | "tron" | "solana";

export type IndustryProfile = "casino" | "risk" | "marketing" | "exchange" | "defi";

export interface LensScoreRow {
  profile: IndustryProfile;
  label: string;
  emoji: string;
  total: number;
}

export type WhaleNetworkJobStatus = "queued" | "running" | "completed" | "failed" | "cancelled";

export interface WhaleNetworkJob {
  job_id: string;
  root_address: string;
  chain: Chain;
  tx_window_days?: number | null;
  telegram_notifications?: boolean;
  status: WhaleNetworkJobStatus;
  progress: string;
  processed_wallets: number;
  skipped_wallets?: number;
  upstream_retries?: number;
  wallet_cache_hits?: number;
  queued_wallets: number;
  scanned_levels: number;
  whale_found: boolean;
  whale_wallet: string | null;
  whale_score: number | null;
  whale_level: number | null;
  error: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}

/** POST /api/v1/whale-network/start — null tx_window_days = full-history neighbors (still capped). */
export interface WhaleNetworkStartOptions {
  tx_window_days?: number | null;
  telegram_chat_id?: string | null;
}

export interface Transaction {
  hash: string;
  from: string;
  to: string;
  valueEth: number;
  timestamp: number;
  blockNumber: number;
}

export interface WalletData {
  chain: Chain;
  address: string;
  balanceEth: number;
  balanceUsd: number | null;
  ethPriceUsd: number | null;
  incomingTx: Transaction[];
  uniqueSenders: number;
}
