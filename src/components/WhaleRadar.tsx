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
  if (color === "green") return "bg-emerald-100 text-emerald-700";
  if (color === "purple") return "bg-purple-100 text-purple-700";
  if (color === "blue") return "bg-blue-100 text-blue-700";
  if (color === "amber") return "bg-amber-100 text-amber-700";
  return "bg-red-100 text-red-700";
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
  const totalUsdReceived = score.totalEthReceived * (data.ethPriceUsd ?? 0);

  const breakdown = [
    {
      name: `Wallet Wealth - Total received: ${score.totalEthReceived.toFixed(4)} ETH ($${totalUsdReceived.toLocaleString(
        undefined,
        { maximumFractionDigits: 2 }
      )})`,
      points: score.wealth,
      max: selectedProfile.weights.wealth,
    },
    {
      name: `Gambling & Risk - Gambling interactions: ${score.gamblingTxCount} txns from known contracts`,
      points: score.gambling,
      max: selectedProfile.weights.gambling,
    },
    { name: "Wallet Age & Profile", points: score.age, max: selectedProfile.weights.age },
    { name: "Volume Signal", points: score.volume, max: selectedProfile.weights.volume },
  ];

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-4 sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-medium text-gray-500">
            {selectedProfile.emoji} {selectedProfile.label} - Whale Radar Score
          </p>
          <p className="text-4xl font-bold tracking-tight text-gray-900">{score.total}</p>
        </div>
        <span
          className={`inline-flex w-fit rounded-full px-3 py-1 text-sm font-medium ${tierClass(score.tierColor)}`}
        >
          {score.tier}
        </span>
      </div>

      <div className="mt-4 h-2.5 w-full rounded-full bg-gray-100">
        <div
          className={`h-2.5 rounded-full transition-all ${progressColor(score.total)}`}
          style={{ width: `${score.total}%` }}
        />
      </div>

      <div className="mt-4 overflow-hidden rounded-lg border border-gray-100">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-600">
            <tr>
              <th className="px-3 py-2 text-left font-medium">Tier</th>
              <th className="px-3 py-2 text-right font-medium">Points</th>
            </tr>
          </thead>
          <tbody>
            {breakdown.map((row) => (
              <tr key={row.name} className="border-t border-gray-100">
                <td className="px-3 py-2 text-gray-700">{row.name}</td>
                <td className="px-3 py-2 text-right font-medium text-gray-900">
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
