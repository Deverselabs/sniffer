import { useState } from "react";
import { fetchWalletData } from "../api";
import { ETHERSCAN_API_KEY } from "../api/config";
import type { WalletData } from "../api";

interface State {
  data: WalletData | null;
  loading: boolean;
  error: string | null;
}

export function useWalletData() {
  const [state, setState] = useState<State>({
    data: null,
    loading: false,
    error: null,
  });

  async function fetchWallet(address: string) {
    setState({ data: null, loading: true, error: null });
    try {
      const data = await fetchWalletData(address, ETHERSCAN_API_KEY);
      setState({ data, loading: false, error: null });
    } catch (e: unknown) {
      const message =
        e instanceof Error ? e.message : "Something went wrong";
      setState({ data: null, loading: false, error: message });
    }
  }

  return { ...state, fetchWallet };
}
