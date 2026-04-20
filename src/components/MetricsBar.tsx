import type { WalletData } from "../api";
import { formatEth, formatUsd } from "../utils/format";

interface MetricsBarProps {
  data: WalletData;
}

export function MetricsBar({ data }: MetricsBarProps) {
  return (
    <section className="grid grid-cols-1 gap-3 md:grid-cols-3">
      <article className="rounded-xl border border-gray-200 bg-white p-4">
        <p className="text-sm text-gray-500">ETH Balance</p>
        <p className="mt-1 text-2xl font-semibold text-gray-900">
          {formatEth(data.balanceEth)}
        </p>
        <p className="mt-1 text-sm text-gray-500">
          {data.balanceUsd !== null ? formatUsd(data.balanceUsd) : "USD unavailable"}
        </p>
      </article>

      <article className="rounded-xl border border-gray-200 bg-white p-4">
        <p className="text-sm text-gray-500">Incoming Txns</p>
        <p className="mt-1 text-2xl font-semibold text-gray-900">
          {data.incomingTx.length}
        </p>
      </article>

      <article className="rounded-xl border border-gray-200 bg-white p-4">
        <p className="text-sm text-gray-500">Unique Senders</p>
        <p className="mt-1 text-2xl font-semibold text-gray-900">
          {data.uniqueSenders}
        </p>
      </article>
    </section>
  );
}
