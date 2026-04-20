import axios from "axios";
import type { WalletData, Transaction } from "./types";

const BASE = "https://api.etherscan.io/v2/api";
const CHAIN_ID = 1; // Ethereum mainnet

interface EtherscanTransaction {
  hash: string;
  from: string;
  to: string;
  value: string;
  timeStamp: string;
  blockNumber: string;
}

export async function fetchWalletData(
  address: string,
  apiKey: string
): Promise<WalletData> {
  const [balRes, txRes, priceRes] = await Promise.all([
    axios.get(BASE, {
      params: {
        module: "account",
        action: "balance",
        chainid: CHAIN_ID,
        address,
        tag: "latest",
        apikey: apiKey,
      },
    }),
    axios.get(BASE, {
      params: {
        module: "account",
        action: "txlist",
        chainid: CHAIN_ID,
        address,
        startblock: 0,
        endblock: 99999999,
        sort: "desc",
        apikey: apiKey,
      },
    }),
    axios
      .get(BASE, {
        params: {
          module: "stats",
          action: "ethprice",
          chainid: CHAIN_ID,
          apikey: apiKey,
        },
      })
      .catch(() => null),
  ]);

  if (balRes.data.status !== "1") {
    throw new Error(balRes.data.message || "Failed to fetch balance");
  }

  const balanceEth = parseFloat(balRes.data.result) / 1e18;
  const ethPriceUsd = priceRes?.data?.result?.ethusd
    ? parseFloat(priceRes.data.result.ethusd)
    : null;
  const balanceUsd = ethPriceUsd ? balanceEth * ethPriceUsd : null;

  const addrLower = address.toLowerCase();
  const raw: EtherscanTransaction[] = Array.isArray(txRes.data.result)
    ? txRes.data.result
    : [];
  const incomingTx: Transaction[] = raw
    .filter((tx) => tx.to?.toLowerCase() === addrLower && tx.value !== "0")
    .map((tx) => ({
      hash: tx.hash,
      from: tx.from,
      to: tx.to,
      valueEth: parseFloat(tx.value) / 1e18,
      timestamp: parseInt(tx.timeStamp, 10),
      blockNumber: parseInt(tx.blockNumber, 10),
    }));

  const uniqueSenders = new Set(incomingTx.map((tx) => tx.from.toLowerCase()))
    .size;

  return {
    address,
    balanceEth,
    balanceUsd,
    ethPriceUsd,
    incomingTx,
    uniqueSenders,
  };
}
