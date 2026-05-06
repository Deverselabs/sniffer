import type { Chain } from "../api";

const ETH_RE = /^0x[a-fA-F0-9]{40}$/;
const TRON_RE = /^T[1-9A-HJ-NP-Za-km-z]{33}$/;
const SOL_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

export function detectChain(address: string): Chain | null {
  const value = address.trim();
  if (ETH_RE.test(value)) return "ethereum";
  if (TRON_RE.test(value)) return "tron";
  if (SOL_RE.test(value)) return "solana";
  return null;
}

export function isValidAddressForChain(address: string, chain: Chain): boolean {
  const value = address.trim();
  if (chain === "ethereum") return ETH_RE.test(value);
  if (chain === "tron") return TRON_RE.test(value);
  return SOL_RE.test(value);
}

export function explorerBase(chain: Chain): string {
  if (chain === "tron") return "https://tronscan.org/#";
  if (chain === "solana") return "https://solscan.io";
  return "https://etherscan.io";
}
