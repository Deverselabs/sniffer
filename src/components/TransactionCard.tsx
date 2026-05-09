import type { Chain, Transaction } from "../api";
import { shortAddr, timeAgo } from "../utils/format";
import { explorerBase } from "../utils/address";

interface TransactionCardProps {
  tx: Transaction;
  chain: Chain;
  onAddressClick: (address: string) => void;
  whaleScore?: number;
}

function scoreBadgeClasses(score: number) {
  if (score >= 90) return "bg-emerald-100 text-emerald-700";
  if (score >= 70) return "bg-purple-100 text-purple-700";
  if (score >= 50) return "bg-blue-100 text-blue-700";
  if (score >= 30) return "bg-amber-100 text-amber-700";
  return "bg-gray-100 text-gray-600";
}

export function TransactionCard({
  tx,
  chain,
  onAddressClick,
  whaleScore,
}: TransactionCardProps) {
  const txLink =
    chain === "tron"
      ? `${explorerBase(chain)}/transaction/${tx.hash}`
      : `${explorerBase(chain)}/tx/${tx.hash}`;
  const token = chain === "tron" ? "TRX" : chain === "solana" ? "SOL" : "ETH";
  return (
    <article className="ui-card-transaction">
      <div className="ui-row-between items-start">
        <div className="ui-stack-tight">
          <p className="ui-text-body text-[rgba(127,119,221,0.6)]">
            From:{" "}
            <button
              type="button"
              onClick={() => onAddressClick(tx.from)}
              className="ui-link font-mono focus:outline-none focus-visible:ring-[0.125em] focus-visible:ring-indigo-300"
            >
              {shortAddr(tx.from)}
            </button>
            {whaleScore !== undefined && (
              <span className={`ui-badge-row ml-[0.35em] ${scoreBadgeClasses(whaleScore)}`}>
                {Math.round(whaleScore)}
              </span>
            )}
          </p>
          <p className="ui-text-body text-[rgba(255,255,255,0.2)]">
            Tx:{" "}
            <a
              href={txLink}
              target="_blank"
              rel="noreferrer"
              className="font-mono text-[rgba(255,255,255,0.2)] hover:text-[rgba(175,169,236,0.9)] hover:underline"
            >
              {shortAddr(tx.hash)}
            </a>
          </p>
        </div>

        <div className="text-right">
          <p className="font-mono text-[112.5%] font-semibold text-[#5DCAA5]">
            +{tx.valueEth.toFixed(4)} {token}
          </p>
          <p className="ui-text-body mt-[0.25em] text-[rgba(255,255,255,0.15)]">{timeAgo(tx.timestamp)}</p>
        </div>
      </div>
    </article>
  );
}
