import { useMemo, useState } from "react";
import type { Chain, Transaction } from "../api";
import { downloadCsv } from "../utils/exportCsv";
import { explorerBase } from "../utils/address";
import { TransactionCard } from "./TransactionCard";

interface TransactionListProps {
  chain: Chain;
  transactions: Transaction[];
  onAddressClick: (address: string) => void;
}

type SortMode = "recent" | "amount";

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
  transactions,
  onAddressClick,
}: TransactionListProps) {
  const [sortMode, setSortMode] = useState<SortMode>("amount");
  const [visibleCount, setVisibleCount] = useState(10);

  const sortedTransactions = useMemo(() => {
    const copy = [...transactions];
    if (sortMode === "amount") {
      return copy.sort((a, b) => b.valueEth - a.valueEth);
    }
    return copy.sort((a, b) => b.timestamp - a.timestamp);
  }, [transactions, sortMode]);

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
      <div className="ui-cluster items-start">
        <p className="ui-text-body text-[rgba(255,255,255,0.35)]">
          Showing {visibleTransactions.length} of {transactions.length} deposits
        </p>
        <div className="ui-row">
          <button type="button" className="ui-btn ui-btn--outline" onClick={handleExportDeposits}>
            Export deposits
          </button>
          <select
            value={sortMode}
            onChange={(e) => setSortMode(e.target.value as SortMode)}
            className="ui-select"
          >
            <option value="recent">Most recent</option>
            <option value="amount">Highest amount</option>
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
            whaleScore={undefined}
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
    </section>
  );
}
