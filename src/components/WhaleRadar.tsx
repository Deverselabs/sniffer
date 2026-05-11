import { useState } from "react";
import type { LensScoreRow, WalletData } from "../api";
import {
  computeWhaleScore,
  INDUSTRY_PROFILES,
  type IndustryProfile,
} from "../utils/whaleScore";

interface WhaleRadarProps {
  data: WalletData;
  profile: IndustryProfile;
  lensScores: LensScoreRow[] | null;
  lensScoresLoading: boolean;
  lensScoresError: string | null;
  onRetryLensScores: () => void;
  whaleNetworkJob: {
    status: string;
    progress: string;
    processed_wallets: number;
    queued_wallets: number;
    scanned_levels: number;
    whale_found: boolean;
    whale_wallet: string | null;
    whale_score: number | null;
    whale_level: number | null;
  } | null;
  whaleNetworkLoading: boolean;
  whaleNetworkError: string | null;
  onCancelWhaleNetworkScan: () => void;
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

export function WhaleRadar({
  data,
  profile,
  lensScores,
  lensScoresLoading,
  lensScoresError,
  onRetryLensScores,
  whaleNetworkJob,
  whaleNetworkLoading,
  whaleNetworkError,
  onCancelWhaleNetworkScan,
}: WhaleRadarProps) {
  const [showOtherLenses, setShowOtherLenses] = useState(false);
  const score = computeWhaleScore(data, profile);
  const selectedProfile = INDUSTRY_PROFILES[profile];

  const otherLensRows = (lensScores ?? []).filter((row) => row.profile !== profile);

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
    <div className="ui-surface ui-whale-stack">
      <article className="ui-whale-card-primary" aria-label="Whale Radar score for selected lens">
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
      </article>

      <section className="ui-whale-card-compare" aria-label="Compare scores across other industry lenses">
        <p className="ui-whale-compare-heading">Other scoring lenses</p>
        <button
          type="button"
          className="ui-btn ui-btn--ghost ui-lens-compare-btn"
          onClick={() => setShowOtherLenses((v) => !v)}
          aria-expanded={showOtherLenses}
        >
          {showOtherLenses ? "Hide other scoring lenses" : "Show scores for other scoring lenses"}
        </button>

        {showOtherLenses && (
          <div className="ui-lens-grid" role="region" aria-label="Scores for other industry profiles">
            {lensScoresLoading && (
              <p className="ui-text-mono-muted" style={{ gridColumn: "1 / -1" }}>
                Loading lens scores…
              </p>
            )}
            {!lensScoresLoading && lensScoresError && (
              <div className="ui-stack-tight" style={{ gridColumn: "1 / -1" }}>
                <p className="ui-text-body text-[#ffb3b2]">{lensScoresError}</p>
                <button type="button" className="ui-btn ui-btn--ghost" onClick={onRetryLensScores}>
                  Retry lens scores
                </button>
              </div>
            )}
            {!lensScoresLoading &&
              !lensScoresError &&
              otherLensRows.map((row) => (
                <div key={row.profile} className="ui-lens-card">
                  <div className="ui-lens-card-title">
                    {row.emoji} {row.label}
                  </div>
                  <div className="ui-lens-card-score">{row.total}</div>
                </div>
              ))}
          </div>
        )}
      </section>

      <details className="ui-whale-breakdown">
        <summary>
          <span>Score breakdown — {selectedProfile.label}</span>
          <span aria-hidden style={{ color: "rgba(251, 191, 36, 0.55)" }}>
            ▾
          </span>
        </summary>
        <div className="ui-whale-breakdown-body">
          <div className="ui-table-wrap-inner">
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
        </div>
      </details>

      <section className="ui-whale-network-card" aria-live="polite">
        <p className="ui-whale-network-heading">Whale network scan (4-level graph)</p>
        {whaleNetworkError && <p className="ui-text-body text-[#ffb3b2]">{whaleNetworkError}</p>}
        {!whaleNetworkError && whaleNetworkJob && (
          <div className="ui-stack-tight">
            <p className="ui-text-body text-[rgba(255,255,255,0.6)]">
              Status: <span className="text-white">{whaleNetworkJob.status}</span> — {whaleNetworkJob.progress}
            </p>
            <p className="ui-text-caption">
              Processed {whaleNetworkJob.processed_wallets} wallet(s), queued {whaleNetworkJob.queued_wallets}, depth{" "}
              {Math.min(4, whaleNetworkJob.scanned_levels + 1)}/4
            </p>
            {whaleNetworkJob.whale_found ? (
              <p className="ui-text-body text-[#5DCAA5]">
                Whale network detected via wallet {whaleNetworkJob.whale_wallet} (score {whaleNetworkJob.whale_score},
                level {whaleNetworkJob.whale_level}).
              </p>
            ) : (
              whaleNetworkJob.status === "completed" && (
                <p className="ui-text-body text-[rgba(255,255,255,0.7)]">No whale wallet found within 4 levels.</p>
              )
            )}
            {whaleNetworkLoading && (
              <button type="button" className="ui-btn ui-btn--ghost" onClick={onCancelWhaleNetworkScan}>
                Cancel background scan
              </button>
            )}
          </div>
        )}
        {!whaleNetworkError && !whaleNetworkJob && (
          <p className="ui-text-caption">Preparing whale network scan…</p>
        )}
      </section>
    </div>
  );
}
