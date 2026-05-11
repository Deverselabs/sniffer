import axios from "axios";
import type { Chain, IndustryProfile, LensScoreRow, Transaction, WalletData } from "./types";

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

export type { Chain, IndustryProfile, LensScoreRow, WalletData, Transaction };
