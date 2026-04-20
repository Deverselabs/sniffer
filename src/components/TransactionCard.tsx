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
    <article className="rounded-xl border border-gray-200 bg-white p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-2">
          <p className="text-sm text-gray-500">
            From:{" "}
            <button
              type="button"
              onClick={() => onAddressClick(tx.from)}
              className="font-mono text-indigo-600 transition hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300"
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
          <p className="text-sm text-gray-500">
            Tx:{" "}
            <a
              href={`https://etherscan.io/tx/${tx.hash}`}
              target="_blank"
              rel="noreferrer"
              className="font-mono text-blue-600 hover:underline"
            >
              {shortAddr(tx.hash)}
            </a>
          </p>
        </div>

        <div className="text-right">
          <p className="text-base font-semibold text-emerald-600">
            +{formatEth(tx.valueEth)}
          </p>
          <p className="mt-1 text-sm text-gray-500">{timeAgo(tx.timestamp)}</p>
        </div>
      </div>
    </article>
  );
}
