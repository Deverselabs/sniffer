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

function progressFillStyle(score: number): { width: string; background: string } {
  const w = `${Math.min(100, Math.max(0, score))}%`;
  if (score >= 90) return { width: w, background: "rgb(16, 185, 129)" };
  if (score >= 70) return { width: w, background: "rgb(168, 85, 247)" };
  if (score >= 50) return { width: w, background: "rgb(59, 130, 246)" };
  if (score >= 30) return { width: w, background: "rgb(245, 158, 11)" };
  return { width: w, background: "rgb(239, 68, 68)" };
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
    <section className="ui-surface ui-card">
      <div className="ui-cluster">
        <div>
          <p className="ui-text-overline" style={{ color: "rgba(255,255,255,0.35)", letterSpacing: "0.08em" }}>
            {selectedProfile.emoji} {selectedProfile.label} - Whale Radar Score
          </p>
          <p className="ui-title-xl ui-mt-tight">{score.total}</p>
        </div>
        <span className={`ui-pill ${tierClass(score.tierColor)}`}>{score.tier}</span>
      </div>

      <div className="ui-mt ui-progress-track">
        <div className="ui-progress-fill" style={progressFillStyle(score.total)} />
      </div>

      <div className="ui-mt ui-table-wrap-inner">
        <table className="ui-table">
          <thead>
            <tr>
              <th>Tier</th>
              <th className="ui-text-right">Points</th>
            </tr>
          </thead>
          <tbody>
            {breakdown.map((row) => (
              <tr key={row.id}>
                <td className="text-[rgba(255,255,255,0.7)]">
                  <div className="ui-stack-tight">
                    <span>{row.label}</span>
                    <div className="ui-progress-track">
                      <div
                        className="ui-progress-fill"
                        style={{ width: `${Math.min(100, (row.points / row.max) * 100)}%` }}
                      />
                    </div>
                  </div>
                </td>
                <td className="ui-text-right font-medium text-white">
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
