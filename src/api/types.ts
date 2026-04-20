export interface Transaction {
  hash: string;
  from: string;
  to: string;
  valueEth: number;
  timestamp: number;
  blockNumber: number;
}

export interface WalletData {
  address: string;
  balanceEth: number;
  balanceUsd: number | null;
  ethPriceUsd: number | null;
  incomingTx: Transaction[];
  uniqueSenders: number;
}
