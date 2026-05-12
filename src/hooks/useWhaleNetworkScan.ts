import { useCallback, useEffect, useRef, useState } from "react";
import { cancelWhaleNetworkScan, fetchWhaleNetworkStatus, startWhaleNetworkScan } from "../api";
import type { Chain, WhaleNetworkJob, WhaleNetworkStartOptions } from "../api";

interface WhaleNetworkState {
  job: WhaleNetworkJob | null;
  loading: boolean;
  error: string | null;
}

function isTerminal(status: string): boolean {
  return status === "completed" || status === "failed" || status === "cancelled";
}

function resolvedTxWindow(opts?: WhaleNetworkStartOptions | null): number | null {
  if (opts?.tx_window_days === undefined) return 30;
  return opts.tx_window_days;
}

function resolvedMaxLevels(opts?: WhaleNetworkStartOptions | null): number {
  const raw = opts?.max_levels;
  if (typeof raw === "number" && Number.isFinite(raw)) {
    return Math.max(1, Math.min(5, Math.floor(raw)));
  }
  return 2;
}

function resumeStorageKey(
  address: string,
  chain: Chain,
  txWindowDays: number | null,
  maxLevels: number
): string {
  const trimmed = address.trim();
  const normalized = chain === "ethereum" ? trimmed.toLowerCase() : trimmed;
  const w = txWindowDays === null ? "full" : String(txWindowDays);
  return `sniffer:whale_network:${chain}:${normalized}:${w}:d${maxLevels}`;
}

function jobMaxLevels(job: WhaleNetworkJob): number {
  if (typeof job.max_levels === "number" && Number.isFinite(job.max_levels)) {
    return Math.max(1, Math.min(8, Math.floor(job.max_levels)));
  }
  return 2;
}

function readStoredJobId(key: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { job_id?: string };
    return typeof parsed.job_id === "string" ? parsed.job_id : null;
  } catch {
    return null;
  }
}

function writeStoredJobId(key: string, jobId: string) {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(key, JSON.stringify({ job_id: jobId }));
  } catch {
    // ignore quota / private mode
  }
}

function clearStoredJobId(key: string | null) {
  if (!key || typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(key);
  } catch {
    // ignore
  }
}

function jobMatchesWallet(job: WhaleNetworkJob, address: string, chain: Chain): boolean {
  if (job.chain !== chain) return false;
  const a = address.trim();
  if (chain === "ethereum") return job.root_address.toLowerCase() === a.toLowerCase();
  return job.root_address === a;
}

function jobTxWindowDays(job: WhaleNetworkJob): number | null {
  if (job.tx_window_days === undefined) return 30;
  return job.tx_window_days;
}

export function useWhaleNetworkScan() {
  const [state, setState] = useState<WhaleNetworkState>({
    job: null,
    loading: false,
    error: null,
  });
  const pollTimer = useRef<number | null>(null);
  const activeJobIdRef = useRef<string | null>(null);
  const activeResumeKeyRef = useRef<string | null>(null);

  const clearPoll = useCallback(() => {
    if (pollTimer.current !== null) {
      window.clearTimeout(pollTimer.current);
      pollTimer.current = null;
    }
  }, []);

  const adoptJob = useCallback(
    (job: WhaleNetworkJob, resumeKey: string) => {
      activeJobIdRef.current = job.job_id;
      activeResumeKeyRef.current = resumeKey;
      writeStoredJobId(resumeKey, job.job_id);
      setState({ job, loading: !isTerminal(job.status), error: null });
    },
    []
  );

  const pollStatus = useCallback(
    async (jobId: string) => {
      try {
        const job = await fetchWhaleNetworkStatus(jobId);
        if (activeJobIdRef.current !== jobId) return;
        setState({ job, loading: !isTerminal(job.status), error: null });
        if (isTerminal(job.status)) {
          if (job.status === "cancelled") {
            clearStoredJobId(activeResumeKeyRef.current);
          } else {
            const k = activeResumeKeyRef.current;
            if (k) writeStoredJobId(k, job.job_id);
          }
          return;
        }
        pollTimer.current = window.setTimeout(() => {
          void pollStatus(jobId);
        }, 2500);
      } catch (e: unknown) {
        if (activeJobIdRef.current !== jobId) return;
        const message = e instanceof Error ? e.message : "Failed to fetch whale network status";
        setState((s) => ({ ...s, loading: false, error: message }));
      }
    },
    []
  );

  const start = useCallback(
    async (address: string, chain: Chain, opts?: WhaleNetworkStartOptions | null) => {
      const txw = resolvedTxWindow(opts);
      const maxLv = resolvedMaxLevels(opts);
      const key = resumeStorageKey(address, chain, txw, maxLv);
      clearPoll();

      if (activeResumeKeyRef.current !== null && activeResumeKeyRef.current !== key) {
        const orphanId = activeJobIdRef.current;
        if (orphanId) {
          try {
            await cancelWhaleNetworkScan(orphanId);
          } catch {
            // Best effort cancel for previous background scan.
          }
        }
        activeJobIdRef.current = null;
        activeResumeKeyRef.current = null;
      }

      const storedId = readStoredJobId(key);
      if (storedId) {
        try {
          const job = await fetchWhaleNetworkStatus(storedId);
          if (
            jobMatchesWallet(job, address, chain) &&
            jobTxWindowDays(job) === txw &&
            jobMaxLevels(job) === maxLv
          ) {
            if (job.status === "cancelled") {
              clearStoredJobId(key);
            } else {
              adoptJob(job, key);
              if (!isTerminal(job.status)) {
                pollTimer.current = window.setTimeout(() => {
                  void pollStatus(job.job_id);
                }, 800);
              }
              return;
            }
          }
        } catch {
          // stale id or network error — fall through to a fresh start
        }
        clearStoredJobId(key);
      }

      const previousId = activeJobIdRef.current;
      if (previousId) {
        try {
          await cancelWhaleNetworkScan(previousId);
        } catch {
          // Best effort cancel for previous background scan.
        }
      }
      activeJobIdRef.current = null;
      activeResumeKeyRef.current = null;

      setState({ job: null, loading: true, error: null });
      try {
        const apiOpts: WhaleNetworkStartOptions = {
          max_levels: resolvedMaxLevels(opts),
        };
        if (opts?.tx_window_days !== undefined) {
          apiOpts.tx_window_days = opts.tx_window_days;
        }
        if (opts?.telegram_chat_id) {
          apiOpts.telegram_chat_id = opts.telegram_chat_id;
        }
        const job = await startWhaleNetworkScan(address, chain, apiOpts);
        adoptJob(job, key);
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
    [adoptJob, clearPoll, pollStatus]
  );

  const cancel = useCallback(async () => {
    const id = activeJobIdRef.current;
    if (!id) return;
    clearPoll();
    try {
      const job = await cancelWhaleNetworkScan(id);
      clearStoredJobId(activeResumeKeyRef.current);
      activeJobIdRef.current = null;
      activeResumeKeyRef.current = null;
      setState({ job, loading: false, error: null });
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Failed to cancel whale network scan";
      setState((s) => ({ ...s, loading: false, error: message }));
    }
  }, [clearPoll]);

  useEffect(() => {
    return () => {
      clearPoll();
    };
  }, [clearPoll]);

  return {
    ...state,
    start,
    cancel,
  };
}

