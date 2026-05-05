const key = import.meta.env.VITE_ETHERSCAN_API_KEY;

if (!key) {
  throw new Error("Missing ETHERSCAN_API_KEY in environment.");
}

export const ETHERSCAN_API_KEY = key;
