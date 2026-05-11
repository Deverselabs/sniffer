import { useCallback, useEffect, useRef, useState } from "react";
import { cancelWhaleNetworkScan, fetchWhaleNetworkStatus, startWhaleNetworkScan } from "../api";
import type { Chain, WhaleNetworkJob } from "../api";

interface WhaleNetworkState {
  job: WhaleNetworkJob | null;
  loading: boolean;
  error: string | null;
}

function isTerminal(status: string): boolean {
  return status === "completed" || status === "failed" || status === "cancelled";
}

export function useWhaleNetworkScan() {
  const [state, setState] = useState<WhaleNetworkState>({
    job: null,
    loading: false,
    error: null,
  });
  const pollTimer = useRef<number | null>(null);
  const activeJobIdRef = useRef<string | null>(null);

  const clearPoll = useCallback(() => {
    if (pollTimer.current !== null) {
      window.clearTimeout(pollTimer.current);
      pollTimer.current = null;
    }
  }, []);

  const pollStatus = useCallback(
    async (jobId: string) => {
      try {
        const job = await fetchWhaleNetworkStatus(jobId);
        if (activeJobIdRef.current !== jobId) return;
        setState({ job, loading: !isTerminal(job.status), error: null });
        if (!isTerminal(job.status)) {
          pollTimer.current = window.setTimeout(() => {
            void pollStatus(jobId);
          }, 2500);
        }
      } catch (e: unknown) {
        if (activeJobIdRef.current !== jobId) return;
        const message = e instanceof Error ? e.message : "Failed to fetch whale network status";
        setState((s) => ({ ...s, loading: false, error: message }));
      }
    },
    []
  );

  const start = useCallback(
    async (address: string, chain: Chain) => {
      const previous = activeJobIdRef.current;
      if (previous) {
        try {
          await cancelWhaleNetworkScan(previous);
        } catch {
          // Best effort cancel for previous background scan.
        }
      }
      clearPoll();
      activeJobIdRef.current = null;
      setState({ job: null, loading: true, error: null });
      try {
        const job = await startWhaleNetworkScan(address, chain);
        activeJobIdRef.current = job.job_id;
        setState({ job, loading: !isTerminal(job.status), error: null });
        if (!isTerminal(job.status)) {
          pollTimer.current = window.setTimeout(() => {
            void pollStatus(job.job_id);
          }, 1200);
        }
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : "Failed to start whale network scan";
        setState({ job: null, loading: false, error: message });
      }
    },
    [clearPoll, pollStatus]
  );

  const cancel = useCallback(async () => {
    const id = activeJobIdRef.current;
    if (!id) return;
    clearPoll();
    try {
      const job = await cancelWhaleNetworkScan(id);
      setState({ job, loading: false, error: null });
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Failed to cancel whale network scan";
      setState((s) => ({ ...s, loading: false, error: message }));
    }
  }, [clearPoll]);

  useEffect(() => {
    return () => {
      void cancel();
      clearPoll();
    };
  }, [cancel, clearPoll]);

  return {
    ...state,
    start,
    cancel,
  };
}

