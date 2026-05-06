import axios from "axios";
import type { Chain, Transaction, WalletData } from "./types";

interface ScanApiResponse {
  address: string;
  chain: Chain;
  balance: number;
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
  return {
    chain: res.data.chain,
    address: res.data.address,
    balanceEth: res.data.balance,
    balanceUsd: null,
    ethPriceUsd: null,
    incomingTx,
    uniqueSenders,
  };
}

export async function fetchRecentAlerts(): Promise<AlertsRecentResponse> {
  const res = await axios.get<AlertsRecentResponse>(`${API_BASE}/api/v1/alerts/recent`);
  return res.data;
}

export type { Chain, WalletData, Transaction };
