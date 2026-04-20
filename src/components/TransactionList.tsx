import { useMemo, useState } from "react";
import type { Transaction } from "../api";
import { downloadCsv } from "../utils/exportCsv";
import { TransactionCard } from "./TransactionCard";

interface TransactionListProps {
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

    const csvRows: string[][] = [
      [
        "tx_hash",
        "from_address",
        "to_address",
        "eth_amount",
        "timestamp_unix",
        "date_readable",
        "etherscan_link",
      ],
      ...transactions.map((tx) => [
        tx.hash,
        tx.from,
        tx.to,
        tx.valueEth.toFixed(4),
        String(tx.timestamp),
        formatReadableUtc(tx.timestamp),
        `https://etherscan.io/tx/${tx.hash}`,
      ]),
    ];

    const date = new Date().toISOString().slice(0, 10);
    const toAddress = transactions[0]?.to ?? "";
    const shortAddress = toAddress ? `${toAddress.slice(0, 6)}${toAddress.slice(-4)}` : "wallet";
    downloadCsv(`deposits-${shortAddress}-${date}.csv`, csvRows);
  }

  if (transactions.length === 0) {
    return (
      <section className="rounded-lg border border-dashed border-[rgba(127,119,221,0.2)] bg-[rgba(255,255,255,0.02)] p-6 text-center font-mono text-[rgba(255,255,255,0.35)]">
        No incoming deposits found for this address
      </section>
    );
  }

  return (
    <section className="space-y-4">
      <div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
        <p className="font-mono text-sm text-[rgba(255,255,255,0.35)]">
          Showing {visibleTransactions.length} of {transactions.length} deposits
        </p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleExportDeposits}
            className="rounded-md border border-[rgba(127,119,221,0.2)] bg-[rgba(127,119,221,0.05)] px-3 py-2 font-mono text-sm font-medium text-[rgba(175,169,236,0.9)] transition hover:bg-[rgba(127,119,221,0.1)]"
          >
            Export deposits
          </button>
          <select
            value={sortMode}
            onChange={(e) => setSortMode(e.target.value as SortMode)}
            className="rounded-md border border-[rgba(127,119,221,0.2)] bg-[rgba(255,255,255,0.03)] px-3 py-2 font-mono text-sm text-[rgba(255,255,255,0.55)]"
          >
            <option value="recent">Most recent</option>
            <option value="amount">Highest amount</option>
          </select>
        </div>
      </div>

      <div className="space-y-3">
        {visibleTransactions.map((tx) => (
          <TransactionCard
            key={tx.hash}
            tx={tx}
            onAddressClick={onAddressClick}
            whaleScore={undefined}
          />
        ))}
      </div>

      {visibleCount < sortedTransactions.length && (
        <button
          onClick={() => setVisibleCount((prev) => prev + 10)}
          className="w-full rounded-lg border border-[rgba(127,119,221,0.2)] bg-[rgba(127,119,221,0.05)] px-4 py-2 font-mono text-sm font-medium text-[rgba(175,169,236,0.9)] transition hover:bg-[rgba(127,119,221,0.1)]"
        >
          Load more
        </button>
      )}
    </section>
  );
}
