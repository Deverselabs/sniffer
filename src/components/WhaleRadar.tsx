import type { WalletData } from "../api";
import {
  computeWhaleScore,
  INDUSTRY_PROFILES,
  type IndustryProfile,
} from "../utils/whaleScore";

interface WhaleRadarProps {
  data: WalletData;
  profile: IndustryProfile;
}

function tierClass(color: "green" | "purple" | "blue" | "amber" | "red") {
  if (color === "green") return "bg-emerald-500/15 text-emerald-300 border border-emerald-500/30";
  if (color === "purple") return "bg-purple-500/15 text-purple-300 border border-purple-500/30";
  if (color === "blue") return "bg-blue-500/15 text-blue-300 border border-blue-500/30";
  if (color === "amber") return "bg-amber-500/15 text-amber-300 border border-amber-500/30";
  return "bg-red-500/15 text-red-300 border border-red-500/30";
}

function progressColor(score: number) {
  if (score >= 90) return "bg-emerald-500";
  if (score >= 70) return "bg-purple-500";
  if (score >= 50) return "bg-blue-500";
  if (score >= 30) return "bg-amber-500";
  return "bg-red-500";
}

export function WhaleRadar({ data, profile }: WhaleRadarProps) {
  const score = computeWhaleScore(data, profile);
  const selectedProfile = INDUSTRY_PROFILES[profile];
  const breakdown = score.tiers.map((tier) => ({
    ...tier,
    label:
      tier.id === "t2"
        ? `${tier.label} (interactions: ${score.gamblingTxCount})`
        : tier.id === "t3"
          ? `${tier.label} (${score.totalEthReceived.toFixed(3)} ETH received)`
          : tier.id === "t4"
            ? `${tier.label} (${Math.floor(score.walletAgeDays)} days)`
            : tier.label,
  }));

  return (
    <section className="rounded-lg border border-[rgba(127,119,221,0.2)] bg-[rgba(127,119,221,0.06)] p-4 sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="font-mono text-xs font-medium uppercase tracking-[0.08em] text-[rgba(255,255,255,0.35)]">
            {selectedProfile.emoji} {selectedProfile.label} - Whale Radar Score
          </p>
          <p className="font-mono text-4xl font-bold tracking-tight text-white">{score.total}</p>
        </div>
        <span
          className={`inline-flex w-fit rounded-full px-3 py-1 text-sm font-medium ${tierClass(score.tierColor)}`}
        >
          {score.tier}
        </span>
      </div>

      <div className="mt-4 h-2.5 w-full rounded-full bg-[rgba(255,255,255,0.06)]">
        <div
          className={`h-2.5 rounded-full transition-all ${progressColor(score.total)}`}
          style={{ width: `${score.total}%` }}
        />
      </div>

      <div className="mt-4 overflow-hidden rounded-lg border border-[rgba(127,119,221,0.18)]">
        <table className="w-full text-sm">
          <thead className="bg-[rgba(255,255,255,0.03)] text-[rgba(255,255,255,0.45)]">
            <tr>
              <th className="px-3 py-2 text-left font-medium">Tier</th>
              <th className="px-3 py-2 text-right font-medium">Points</th>
            </tr>
          </thead>
          <tbody>
            {breakdown.map((row) => (
              <tr key={row.id} className="border-t border-[rgba(127,119,221,0.12)]">
                <td className="px-3 py-2 text-[rgba(255,255,255,0.7)]">
                  <div className="flex flex-col gap-1">
                    <span>{row.label}</span>
                    <div className="h-1.5 w-full rounded-full bg-[rgba(255,255,255,0.08)]">
                      <div
                        className="h-1.5 rounded-full bg-indigo-400"
                        style={{ width: `${Math.min(100, (row.points / row.max) * 100)}%` }}
                      />
                    </div>
                  </div>
                </td>
                <td className="px-3 py-2 text-right font-medium text-white">
                  {row.points}/{row.max}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
