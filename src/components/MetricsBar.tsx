import type { WalletData } from "../api";
import { formatEth, formatUsd } from "../utils/format";

interface MetricsBarProps {
  data: WalletData;
}

export function MetricsBar({ data }: MetricsBarProps) {
  return (
    <section className="ui-metrics-grid ui-surface">
      <article className="ui-card ui-card--muted">
        <p className="ui-text-overline">ETH Balance</p>
        <p className="ui-title-xl ui-mt-tight">{formatEth(data.balanceEth)}</p>
        <p className="ui-text-caption ui-mt-tight">
          {data.balanceUsd !== null ? formatUsd(data.balanceUsd) : "USD unavailable"}
        </p>
      </article>

      <article className="ui-card ui-card--muted">
        <p className="ui-text-overline">Incoming Txns</p>
        <p className="ui-title-xl ui-mt-tight">{data.incomingTx.length}</p>
      </article>

      <article className="ui-card ui-card--muted">
        <p className="ui-text-overline">Unique Senders</p>
        <p className="ui-title-xl ui-mt-tight">{data.uniqueSenders}</p>
      </article>
    </section>
  );
}
