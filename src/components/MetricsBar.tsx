import type { WalletData } from "../api";
import { formatEth, formatUsd } from "../utils/format";

interface MetricsBarProps {
  data: WalletData;
}

export function MetricsBar({ data }: MetricsBarProps) {
  return (
    <section className="grid grid-cols-1 gap-3 md:grid-cols-3">
      <article className="rounded-lg border border-[rgba(127,119,221,0.12)] bg-[rgba(255,255,255,0.03)] p-4">
        <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-[rgba(255,255,255,0.25)]">
          ETH Balance
        </p>
        <p className="mt-1 font-mono text-2xl font-semibold text-white">
          {formatEth(data.balanceEth)}
        </p>
        <p className="mt-1 font-mono text-xs text-[rgba(255,255,255,0.35)]">
          {data.balanceUsd !== null ? formatUsd(data.balanceUsd) : "USD unavailable"}
        </p>
      </article>

      <article className="rounded-lg border border-[rgba(127,119,221,0.12)] bg-[rgba(255,255,255,0.03)] p-4">
        <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-[rgba(255,255,255,0.25)]">
          Incoming Txns
        </p>
        <p className="mt-1 font-mono text-2xl font-semibold text-white">
          {data.incomingTx.length}
        </p>
      </article>

      <article className="rounded-lg border border-[rgba(127,119,221,0.12)] bg-[rgba(255,255,255,0.03)] p-4">
        <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-[rgba(255,255,255,0.25)]">
          Unique Senders
        </p>
        <p className="mt-1 font-mono text-2xl font-semibold text-white">
          {data.uniqueSenders}
        </p>
      </article>
    </section>
  );
}
