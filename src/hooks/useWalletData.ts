import { useState } from "react";
import { fetchWalletData } from "../api";
import type { Chain, WalletData } from "../api";

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

  async function fetchWallet(address: string, chain: Chain) {
    setState({ data: null, loading: true, error: null });
    try {
      const data = await fetchWalletData(address, chain);
      setState({ data, loading: false, error: null });
    } catch (e: unknown) {
      const message =
        e instanceof Error ? e.message : "Something went wrong";
      setState({ data: null, loading: false, error: message });
    }
  }

  function clear() {
    setState({ data: null, loading: false, error: null });
  }

  return { ...state, fetchWallet, clear };
}
