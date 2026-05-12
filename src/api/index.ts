import axios from "axios";
import type {
  Chain,
  IndustryProfile,
  LensScoreRow,
  Transaction,
  WalletData,
  WhaleNetworkJob,
  WhaleNetworkJobStatus,
  WhaleNetworkStartOptions,
} from "./types";

interface ScanApiResponse {
  address: string;
  chain: Chain;
  balance: number;
  eth_price_usd?: number;
  deposits: Array<{
    hash: string;
    from: string;
    to: string;
    value_native: number;
    timestamp: number;
  }>;
}

interface AlertsRecentResponse {
  count: number;
  items: Array<{
    address: string;
    chain: Chain;
    score: number;
    route: string;
    created_at: string | null;
  }>;
}

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "";

export async function fetchWalletData(address: string, chain: Chain): Promise<WalletData> {
  const res = await axios.post<ScanApiResponse>(`${API_BASE}/api/v1/scan`, { address, chain });
  const incomingTx: Transaction[] = res.data.deposits.map((tx, idx) => ({
    hash: tx.hash,
    from: tx.from,
    to: tx.to,
    valueEth: tx.value_native,
    timestamp: tx.timestamp,
    blockNumber: idx,
  }));
  const uniqueSenders = new Set(incomingTx.map((tx) => tx.from.toLowerCase())).size;
  const ethPriceUsd =
    typeof res.data.eth_price_usd === "number" && Number.isFinite(res.data.eth_price_usd)
      ? res.data.eth_price_usd
      : null;
  return {
    chain: res.data.chain,
    address: res.data.address,
    balanceEth: res.data.balance,
    balanceUsd: null,
    ethPriceUsd,
    incomingTx,
    uniqueSenders,
  };
}

export async function fetchAllLensScores(data: WalletData): Promise<LensScoreRow[]> {
  const incoming_tx = data.incomingTx.map((tx) => ({
    from: tx.from,
    valueEth: tx.valueEth,
    timestamp: tx.timestamp,
  }));
  const res = await axios.post<{ profiles: LensScoreRow[] }>(`${API_BASE}/api/v1/lens-scores`, {
    balance_eth: data.balanceEth,
    eth_price_usd: data.ethPriceUsd ?? 0,
    unique_senders: data.uniqueSenders,
    incoming_tx,
  });
  return res.data.profiles;
}

export async function fetchRecentAlerts(): Promise<AlertsRecentResponse> {
  const res = await axios.get<AlertsRecentResponse>(`${API_BASE}/api/v1/alerts/recent`);
  return res.data;
}

export async function startWhaleNetworkScan(
  address: string,
  chain: Chain,
  options?: WhaleNetworkStartOptions | null
): Promise<WhaleNetworkJob> {
  const body: Record<string, unknown> = { address, chain };
  if (options?.tx_window_days !== undefined) {
    body.tx_window_days = options.tx_window_days;
  }
  if (options?.telegram_chat_id) {
    body.telegram_chat_id = options.telegram_chat_id;
  }
  if (options?.max_levels !== undefined && options.max_levels !== null) {
    body.max_levels = options.max_levels;
  }
  const res = await axios.post<WhaleNetworkJob>(`${API_BASE}/api/v1/whale-network/start`, body);
  return res.data;
}

export async function fetchWhaleNetworkStatus(jobId: string): Promise<WhaleNetworkJob> {
  const res = await axios.get<WhaleNetworkJob>(`${API_BASE}/api/v1/whale-network/${jobId}`);
  return res.data;
}

export async function cancelWhaleNetworkScan(jobId: string): Promise<WhaleNetworkJob> {
  const res = await axios.post<WhaleNetworkJob>(`${API_BASE}/api/v1/whale-network/${jobId}/cancel`);
  return res.data;
}

export type {
  Chain,
  IndustryProfile,
  LensScoreRow,
  WalletData,
  Transaction,
  WhaleNetworkJob,
  WhaleNetworkJobStatus,
  WhaleNetworkStartOptions,
};
