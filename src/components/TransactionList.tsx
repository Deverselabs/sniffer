import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { Chain, IndustryProfile, Transaction } from "../api";
import { fetchWalletData } from "../api";
import { downloadCsv } from "../utils/exportCsv";
import { explorerBase } from "../utils/address";
import { computeWhaleScore } from "../utils/whaleScore";
import { TransactionCard } from "./TransactionCard";

interface TransactionListProps {
  chain: Chain;
  profile: IndustryProfile;
  transactions: Transaction[];
  onAddressClick: (address: string) => void;
}

type SortMode = "recent" | "amount" | "score";

const SCORE_FETCH_CONCURRENCY = 4;

function formatReadableUtc(unixTs: number): string {
  const date = new Date(unixTs * 1000);
  const yyyy = date.getUTCFullYear();
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(date.getUTCDate()).padStart(2, "0");
  const hh = String(date.getUTCHours()).padStart(2, "0");
  const min = String(date.getUTCMinutes()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd} ${hh}:${min} UTC`;
}

export function TransactionList({
  chain,
  profile,
  transactions,
  onAddressClick,
}: TransactionListProps) {
  const [sortMode, setSortMode] = useState<SortMode>("amount");
  const [visibleCount, setVisibleCount] = useState(10);
  const [senderScores, setSenderScores] = useState<Record<string, number>>({});
  const senderScoresRef = useRef(senderScores);
  senderScoresRef.current = senderScores;
  const transactionsRef = useRef(transactions);
  transactionsRef.current = transactions;

  const recipientAddress = transactions[0]?.to ?? "";
  const transactionsFingerprint = useMemo(
    () => transactions.map((t) => t.hash).join("\n"),
    [transactions]
  );

  useLayoutEffect(() => {
    setSenderScores({});
  }, [recipientAddress, chain, transactionsFingerprint, profile]);

  useEffect(() => {
    const txs = transactionsRef.current;
    if (sortMode !== "score" || txs.length === 0) return;

    const froms = [...new Set(txs.map((t) => t.from))];
    const need = froms.filter((f) => !(f in senderScoresRef.current));
    if (need.length === 0) return;

    let cancelled = false;
    const queue = [...need];

    async function worker() {
      while (!cancelled && queue.length > 0) {
        const addr = queue.shift();
        if (!addr) break;
        try {
          const data = await fetchWalletData(addr, chain);
          const total = computeWhaleScore(data, profile).total;
          if (!cancelled) {
            setSenderScores((prev) => ({ ...prev, [addr]: total }));
          }
        } catch {
          if (!cancelled) {
            setSenderScores((prev) => ({ ...prev, [addr]: 0 }));
          }
        }
      }
    }

    const workers = Array.from({ length: Math.min(SCORE_FETCH_CONCURRENCY, queue.length) }, () =>
      worker()
    );
    void Promise.all(workers);

    return () => {
      cancelled = true;
    };
  }, [sortMode, chain, profile, transactionsFingerprint, recipientAddress]);

  const sortedTransactions = useMemo(() => {
    const copy = [...transactions];
    if (sortMode === "amount") {
      return copy.sort((a, b) => b.valueEth - a.valueEth);
    }
    if (sortMode === "score") {
      const rank = (from: string) => {
        const s = senderScores[from];
        return s === undefined ? -1 : s;
      };
      return copy.sort((a, b) => {
        const diff = rank(b.from) - rank(a.from);
        if (diff !== 0) return diff;
        return b.timestamp - a.timestamp;
      });
    }
    return copy.sort((a, b) => b.timestamp - a.timestamp);
  }, [transactions, sortMode, senderScores]);

  const scorePendingCount = useMemo(() => {
    if (sortMode !== "score" || transactions.length === 0) return 0;
    const uniqueFrom = new Set(transactions.map((t) => t.from));
    return [...uniqueFrom].filter((f) => !(f in senderScores)).length;
  }, [sortMode, transactions, senderScores]);

  const visibleTransactions = sortedTransactions.slice(0, visibleCount);

  function handleExportDeposits() {
    if (transactions.length === 0) return;

    const txPrefix = chain === "tron" ? "transaction" : "tx";
    const csvRows: string[][] = [
      [
        "tx_hash",
        "from_address",
        "to_address",
        "eth_amount",
        "timestamp_unix",
        "date_readable",
        "explorer_link",
      ],
      ...transactions.map((tx) => [
        tx.hash,
        tx.from,
        tx.to,
        tx.valueEth.toFixed(4),
        String(tx.timestamp),
        formatReadableUtc(tx.timestamp),
        `${explorerBase(chain)}/${txPrefix}/${tx.hash}`,
      ]),
    ];

    const date = new Date().toISOString().slice(0, 10);
    const toAddress = transactions[0]?.to ?? "";
    const shortAddress = toAddress ? `${toAddress.slice(0, 6)}${toAddress.slice(-4)}` : "wallet";
    downloadCsv(`deposits-${shortAddress}-${date}.csv`, csvRows);
  }

  if (transactions.length === 0) {
    return (
      <section className="ui-card ui-card--dashed py-[4vh] text-center font-mono ui-text-mono-muted">
        No incoming deposits found for this address
      </section>
    );
  }

  return (
    <section className="ui-stack ui-surface">
      <details className="ui-collapsible" style={{ marginTop: 0 }}>
        <summary>
          <span>Deposit details — {transactions.length} incoming</span>
          <span aria-hidden style={{ color: "rgba(127,119,221,0.45)" }}>
            ▾
          </span>
        </summary>
        <div className="ui-collapsible-body">
          <div className="ui-stack ui-stack-tight">
            <div className="ui-cluster items-start">
              <p className="ui-text-body text-[rgba(255,255,255,0.35)]">
                Showing {visibleTransactions.length} of {transactions.length} deposits
                {scorePendingCount > 0 ? (
                  <span className="text-[rgba(175,169,236,0.85)]">
                    {" "}
                    — loading {scorePendingCount} depositor scores…
                  </span>
                ) : null}
              </p>
              <div className="ui-row">
                <button type="button" className="ui-btn ui-btn--outline" onClick={handleExportDeposits}>
                  Export deposits
                </button>
                <select
                  value={sortMode}
                  onChange={(e) => setSortMode(e.target.value as SortMode)}
                  className="ui-select"
                  aria-label="Sort deposits"
                >
                  <option value="recent">Most recent</option>
                  <option value="amount">Highest amount</option>
                  <option value="score">Score</option>
                </select>
              </div>
            </div>

            <div className="ui-stack-tight">
              {visibleTransactions.map((tx) => (
                <TransactionCard
                  key={tx.hash}
                  tx={tx}
                  chain={chain}
                  onAddressClick={onAddressClick}
                  whaleScore={tx.from in senderScores ? senderScores[tx.from] : undefined}
                />
              ))}
            </div>

            {visibleCount < sortedTransactions.length && (
              <button
                type="button"
                className="ui-btn ui-btn--outline w-full"
                onClick={() => setVisibleCount((prev) => prev + 10)}
              >
                Load more
              </button>
            )}
          </div>
        </div>
      </details>
    </section>
  );
}
