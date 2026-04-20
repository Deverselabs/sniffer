import type { Transaction } from "../api";
import { formatEth, shortAddr, timeAgo } from "../utils/format";

interface TransactionCardProps {
  tx: Transaction;
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
  onAddressClick,
  whaleScore,
}: TransactionCardProps) {
  return (
    <article className="rounded-lg border border-[rgba(255,255,255,0.05)] bg-[rgba(255,255,255,0.02)] p-4 transition hover:border-[rgba(127,119,221,0.2)]">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-2">
          <p className="font-mono text-sm text-[rgba(127,119,221,0.6)]">
            From:{" "}
            <button
              type="button"
              onClick={() => onAddressClick(tx.from)}
              className="font-mono text-[#AFA9EC] transition hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300"
            >
              {shortAddr(tx.from)}
            </button>
            {whaleScore !== undefined && (
              <span
                className={`ml-2 inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${scoreBadgeClasses(whaleScore)}`}
              >
                {Math.round(whaleScore)}
              </span>
            )}
          </p>
          <p className="font-mono text-sm text-[rgba(255,255,255,0.2)]">
            Tx:{" "}
            <a
              href={`https://etherscan.io/tx/${tx.hash}`}
              target="_blank"
              rel="noreferrer"
              className="font-mono text-[rgba(255,255,255,0.2)] hover:text-[rgba(175,169,236,0.9)] hover:underline"
            >
              {shortAddr(tx.hash)}
            </a>
          </p>
        </div>

        <div className="text-right">
          <p className="font-mono text-base font-semibold text-[#5DCAA5]">
            +{formatEth(tx.valueEth)}
          </p>
          <p className="mt-1 font-mono text-sm text-[rgba(255,255,255,0.15)]">{timeAgo(tx.timestamp)}</p>
        </div>
      </div>
    </article>
  );
}
