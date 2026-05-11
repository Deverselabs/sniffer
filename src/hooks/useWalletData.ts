import { useCallback, useRef, useState } from "react";
import { fetchAllLensScores, fetchWalletData } from "../api";
import type { Chain, LensScoreRow, WalletData } from "../api";

interface State {
  data: WalletData | null;
  loading: boolean;
  error: string | null;
  lensScores: LensScoreRow[] | null;
  lensScoresLoading: boolean;
  lensScoresError: string | null;
}

export function useWalletData() {
  const [state, setState] = useState<State>({
    data: null,
    loading: false,
    error: null,
    lensScores: null,
    lensScoresLoading: false,
    lensScoresError: null,
  });

  const dataRef = useRef<WalletData | null>(null);
  dataRef.current = state.data;

  const loadLensScoresForWallet = useCallback(async (wallet: WalletData) => {
    setState((s) => ({
      ...s,
      lensScoresLoading: true,
      lensScoresError: null,
      lensScores: null,
    }));
    try {
      const lensScores = await fetchAllLensScores(wallet);
      setState((s) => {
        if (!s.data || s.data.address !== wallet.address || s.data.chain !== wallet.chain) {
          return { ...s, lensScoresLoading: false };
        }
        return { ...s, lensScores, lensScoresLoading: false, lensScoresError: null };
      });
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Could not load lens scores";
      setState((s) => {
        if (!s.data || s.data.address !== wallet.address || s.data.chain !== wallet.chain) {
          return { ...s, lensScoresLoading: false };
        }
        return { ...s, lensScoresLoading: false, lensScoresError: message };
      });
    }
  }, []);

  const reloadLensScores = useCallback(() => {
    const wallet = dataRef.current;
    if (!wallet) return;
    void loadLensScoresForWallet(wallet);
  }, [loadLensScoresForWallet]);

  async function fetchWallet(address: string, chain: Chain) {
    setState({
      data: null,
      loading: true,
      error: null,
      lensScores: null,
      lensScoresLoading: false,
      lensScoresError: null,
    });
    try {
      const data = await fetchWalletData(address, chain);
      setState({
        data,
        loading: false,
        error: null,
        lensScores: null,
        lensScoresLoading: true,
        lensScoresError: null,
      });
      void loadLensScoresForWallet(data);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Something went wrong";
      setState({
        data: null,
        loading: false,
        error: message,
        lensScores: null,
        lensScoresLoading: false,
        lensScoresError: null,
      });
    }
  }

  function clear() {
    setState({
      data: null,
      loading: false,
      error: null,
      lensScores: null,
      lensScoresLoading: false,
      lensScoresError: null,
    });
  }

  return {
    ...state,
    fetchWallet,
    clear,
    reloadLensScores,
  };
}
