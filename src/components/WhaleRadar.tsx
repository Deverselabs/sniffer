import { useEffect, useState } from "react";
import type { LensScoreRow, WalletData, WhaleNetworkJob } from "../api";
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
  whaleTxWindowDays: number | null;
  onWhaleTxWindowDaysChange: (days: number | null) => void;
  whaleTelegramForScan: string;
  onApplyWhaleTelegram: (trimmed: string) => void;
  whaleNetworkJob: WhaleNetworkJob | null;
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
  whaleTxWindowDays,
  onWhaleTxWindowDaysChange,
  whaleTelegramForScan,
  onApplyWhaleTelegram,
  whaleNetworkJob,
  whaleNetworkLoading,
  whaleNetworkError,
  onCancelWhaleNetworkScan,
}: WhaleRadarProps) {
  const [showOtherLenses, setShowOtherLenses] = useState(false);
  const [tgDraft, setTgDraft] = useState(whaleTelegramForScan);

  useEffect(() => {
    setTgDraft(whaleTelegramForScan);
  }, [whaleTelegramForScan, data.address, data.chain]);

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
    <div className="ui-surface ui-card ui-whale-radar-panel" aria-label="Whale Radar">
      <div className="ui-whale-radar-panel-inner">
      <article className="ui-whale-panel-section" aria-label="Whale Radar score for selected lens">
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

      <section className="ui-whale-panel-section" aria-label="Compare scores across other industry lenses">
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

      <details className="ui-whale-panel-section ui-whale-breakdown">
        <summary>
          <span>Score breakdown — {selectedProfile.label}</span>
          <span aria-hidden className="ui-whale-breakdown-chevron">
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

      <section className="ui-whale-panel-section" aria-live="polite">
        <p className="ui-whale-network-heading">Whale network scan (4 levels)</p>
        <p className="ui-text-caption" style={{ marginBottom: "0.65em" }}>
          Each round scores the wallet, then expands to distinct counterparties from incoming/outgoing activity in the
          selected time window (capped per wallet). Repeats up to four rounds.
        </p>
        <div className="ui-whale-network-options ui-stack-tight">
          <label className="ui-text-overline" style={{ color: "rgba(183,176,255,0.55)" }}>
            Neighbor transaction window
          </label>
          <select
            value={whaleTxWindowDays === null ? "full" : String(whaleTxWindowDays)}
            onChange={(e) => {
              const v = e.target.value;
              onWhaleTxWindowDaysChange(v === "full" ? null : Number(v));
            }}
            aria-label="Transaction window for neighbor discovery"
          >
            <option value="15">Last 15 days</option>
            <option value="30">Last 30 days</option>
            <option value="full">Full history (slower, still capped)</option>
          </select>
          <label className="ui-text-overline ui-mt-tight" style={{ color: "rgba(183,176,255,0.55)" }}>
            Telegram chat or channel id
          </label>
          <input
            type="text"
            placeholder="-1001234567890 or @channelusername"
            value={tgDraft}
            onChange={(e) => setTgDraft(e.target.value)}
            aria-label="Telegram destination for scan updates"
            autoComplete="off"
          />
          <p className="ui-text-caption">
            Set <code className="text-[rgba(200,190,255,0.85)]">TELEGRAM_BOT_TOKEN</code> on the server. Add the bot to
            your channel as admin, then paste the channel id here. Use &quot;Apply Telegram&quot; to restart the job
            with this destination.
          </p>
          <div className="ui-cluster" style={{ flexWrap: "wrap", gap: "0.5em" }}>
            <button type="button" className="ui-btn ui-btn--ghost" onClick={() => onApplyWhaleTelegram(tgDraft.trim())}>
              Apply Telegram &amp; restart scan
            </button>
          </div>
        </div>
        {whaleNetworkError && <p className="ui-text-body text-[#ffb3b2] ui-mt">{whaleNetworkError}</p>}
        {!whaleNetworkError && whaleNetworkJob && (
          <div className="ui-stack-tight ui-mt">
            <p className="ui-text-caption">
              Job window:{" "}
              <span className="text-white">
                {whaleNetworkJob.tx_window_days === null
                  ? "full"
                  : `${whaleNetworkJob.tx_window_days ?? 30}d`}
              </span>
              {whaleNetworkJob.telegram_notifications ? (
                <span> · Telegram updates on</span>
              ) : (
                <span> · Telegram updates off</span>
              )}
            </p>
            <p className="ui-text-body text-[rgba(255,255,255,0.6)]">
              Status: <span className="text-white">{whaleNetworkJob.status}</span> — {whaleNetworkJob.progress}
            </p>
            <p className="ui-text-caption">
              Processed {whaleNetworkJob.processed_wallets} wallet(s)
              {(whaleNetworkJob.skipped_wallets ?? 0) > 0 ? (
                <span>, skipped {whaleNetworkJob.skipped_wallets} (upstream errors)</span>
              ) : null}
              , queued {whaleNetworkJob.queued_wallets}, depth {Math.min(4, whaleNetworkJob.scanned_levels + 1)}/4
            </p>
            {whaleNetworkJob.error && whaleNetworkJob.status === "failed" && (
              <p className="ui-text-body text-[#ffb3b2]">Error: {whaleNetworkJob.error}</p>
            )}
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
          <p className="ui-text-caption ui-mt">Preparing whale network scan…</p>
        )}
      </section>
      </div>
    </div>
  );
}
