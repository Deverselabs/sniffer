import { Fragment, useState } from "react";
import type { LensScoreRow, WalletData, WhaleNetworkJob } from "../api";
import { NEIGHBOR_WINDOW_PRESET_DAYS, neighborWindowSelectKey } from "../utils/whaleNeighborWindowUi";
import { shortAddr } from "../utils/format";
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
  whaleMaxLevels: number;
  onWhaleMaxLevelsChange: (levels: number) => void;
  whaleTelegramForScan: string;
  onWhaleTelegramForScanChange: (value: string) => void;
  whaleNetworkJob: WhaleNetworkJob | null;
  whaleNetworkLoading: boolean;
  whaleNetworkError: string | null;
  onCancelWhaleNetworkScan: () => void;
  /** Navigate to a wallet from the map (same as deposit "From" click). */
  onWhaleMapWalletClick: (address: string) => void;
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

function whaleStatusLabel(status: string): string {
  if (status === "running" || status === "queued") return "Scanning";
  if (status === "completed") return "Done";
  if (status === "failed") return "Issue";
  if (status === "cancelled") return "Cancelled";
  return status;
}

function ordinalLevel(n: number): string {
  switch (Math.max(1, Math.min(5, Math.floor(n)))) {
    case 1:
      return "1st";
    case 2:
      return "2nd";
    case 3:
      return "3rd";
    case 4:
      return "4th";
    default:
      return "5th";
  }
}

function WhaleMapAddressPath({
  label,
  path,
  onWalletClick,
}: {
  label: string;
  path: string[];
  onWalletClick: (address: string) => void;
}) {
  if (!path?.length) return null;
  return (
    <div className="ui-whale-path-block">
      <p className="ui-whale-path-label">{label}</p>
      <div className="ui-whale-path-flow" aria-label={label}>
        {path.map((addr, i) => (
          <Fragment key={`${i}-${addr}`}>
            {i > 0 ? <span className="ui-whale-path-arrow" aria-hidden>→</span> : null}
            <button
              type="button"
              className="ui-link ui-whale-path-link font-mono"
              title={addr}
              onClick={() => onWalletClick(addr)}
            >
              {shortAddr(addr)}
            </button>
          </Fragment>
        ))}
      </div>
    </div>
  );
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
  whaleMaxLevels,
  onWhaleMaxLevelsChange,
  whaleTelegramForScan,
  onWhaleTelegramForScanChange,
  whaleNetworkJob,
  whaleNetworkLoading,
  whaleNetworkError,
  onCancelWhaleNetworkScan,
  onWhaleMapWalletClick,
}: WhaleRadarProps) {
  const [showOtherLenses, setShowOtherLenses] = useState(false);

  const score = computeWhaleScore(data, profile);
  const selectedProfile = INDUSTRY_PROFILES[profile];

  const otherLensRows = (lensScores ?? []).filter((row) => row.profile !== profile);

  const displayMaxLevels = whaleNetworkJob?.max_levels ?? whaleMaxLevels;

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
    <Fragment>
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
        </div>
      </div>

      <section className="ui-surface ui-card ui-whale-network-status-card" aria-live="polite">
        <div className="ui-whale-status-head">
          <div>
            <p className="ui-whale-status-title">Whale map</p>
            <p className="ui-whale-status-sub">
              {whaleTxWindowDays == null
                ? `Searching till ${ordinalLevel(whaleMaxLevels)} level for full-history transactions`
                : `Searching till ${ordinalLevel(whaleMaxLevels)} level for last ${whaleTxWindowDays} ${whaleTxWindowDays === 1 ? "Day" : "Days"} transactions`}
            </p>
          </div>
          {(whaleNetworkJob || whaleNetworkLoading) && (
            <span
              className="ui-whale-status-pill"
              data-status={whaleNetworkJob?.status ?? "queued"}
              title={whaleNetworkJob?.progress ?? ""}
            >
              {whaleNetworkJob ? whaleStatusLabel(whaleNetworkJob.status) : "Starting"}
            </span>
          )}
        </div>

        {whaleNetworkError && <p className="ui-whale-status-error">{whaleNetworkError}</p>}

        {!whaleNetworkError && whaleNetworkLoading && !whaleNetworkJob && (
          <p className="ui-whale-status-muted">Starting…</p>
        )}

        {!whaleNetworkError && whaleNetworkJob && (
          <div className="ui-whale-status-body">
            <div className="ui-whale-status-metrics">
              <div>
                <span className="ui-whale-metric-value">{whaleNetworkJob.processed_wallets}</span>
                <span className="ui-whale-metric-label">wallets</span>
              </div>
              <div>
                <span className="ui-whale-metric-value">
                  {Math.min(displayMaxLevels, whaleNetworkJob.scanned_levels + 1)}
                </span>
                <span className="ui-whale-metric-label">depth</span>
              </div>
              <div>
                <span className="ui-whale-metric-value">{whaleNetworkJob.queued_wallets}</span>
                <span className="ui-whale-metric-label">queued</span>
              </div>
            </div>
            {(whaleNetworkJob.wallet_cache_hits ?? 0) > 0 && (
              <p className="ui-whale-status-muted">
                Reused {whaleNetworkJob.wallet_cache_hits} wallet scan(s) — same on-chain activity tip as last time.
              </p>
            )}
            {whaleNetworkJob.status === "failed" && whaleNetworkJob.error && (
              <p className="ui-whale-status-error">{whaleNetworkJob.error}</p>
            )}
            {whaleNetworkJob.status === "completed" && whaleNetworkJob.whale_found && (
              <div className="ui-whale-ultimate-banner ui-stack-tight">
                <p className="ui-whale-ultimate-title">Ultimate Whale identified in network</p>
                <p className="ui-whale-status-muted" style={{ marginTop: 0 }}>
                  Score {whaleNetworkJob.whale_score ?? "—"} at hop {whaleNetworkJob.whale_level ?? "—"} — open any hop
                  below to inspect that wallet (same as deposit sender navigation).
                </p>
                {whaleNetworkJob.whale_path && whaleNetworkJob.whale_path.length > 0 ? (
                  <WhaleMapAddressPath
                    label="Path from your wallet to the identified whale"
                    path={whaleNetworkJob.whale_path}
                    onWalletClick={onWhaleMapWalletClick}
                  />
                ) : whaleNetworkJob.whale_wallet ? (
                  <button
                    type="button"
                    className="ui-link font-mono"
                    title={whaleNetworkJob.whale_wallet}
                    onClick={() => onWhaleMapWalletClick(whaleNetworkJob.whale_wallet!)}
                  >
                    {shortAddr(whaleNetworkJob.whale_wallet)}
                  </button>
                ) : null}
              </div>
            )}
            {whaleNetworkJob.status === "completed" &&
              whaleNetworkJob.network_max_score != null && (
                <div className="ui-whale-network-max ui-stack-tight">
                  <p className="ui-whale-network-max-title">Highest score in explored map</p>
                  <p className="ui-whale-network-max-value">{whaleNetworkJob.network_max_score}</p>
                  {whaleNetworkJob.network_max_score_wallet ? (
                    <p className="ui-whale-status-muted" style={{ marginTop: 0 }}>
                      Wallet:{" "}
                      <button
                        type="button"
                        className="ui-link font-mono"
                        title={whaleNetworkJob.network_max_score_wallet}
                        onClick={() => onWhaleMapWalletClick(whaleNetworkJob.network_max_score_wallet!)}
                      >
                        {shortAddr(whaleNetworkJob.network_max_score_wallet)}
                      </button>
                    </p>
                  ) : null}
                  <WhaleMapAddressPath
                    label="Path from root to that wallet"
                    path={whaleNetworkJob.network_max_score_path ?? []}
                    onWalletClick={onWhaleMapWalletClick}
                  />
                </div>
              )}
            {whaleNetworkJob.status === "completed" && !whaleNetworkJob.whale_found && (
              <p className="ui-whale-status-muted">
                No high-score wallet (≥70) found within {whaleNetworkJob.max_levels ?? 2} levels.
              </p>
            )}
            {whaleNetworkLoading && (
              <button type="button" className="ui-btn ui-btn--ghost ui-whale-cancel" onClick={onCancelWhaleNetworkScan}>
                Stop scan
              </button>
            )}
          </div>
        )}
      </section>

      <details className="ui-surface ui-card ui-whale-scan-further">
        <summary className="ui-whale-scan-further-summary">Go deeper — time range &amp; search depth</summary>
        <div className="ui-whale-scan-further-body">
          <label className="ui-whale-field-label">Neighbor activity window</label>
          <select
            className="ui-whale-field-control"
            value={neighborWindowSelectKey(whaleTxWindowDays)}
            onChange={(e) => {
              const v = e.target.value;
              if (v === "full") {
                onWhaleTxWindowDaysChange(null);
              } else if (v === "custom") {
                const cur = whaleTxWindowDays;
                if (
                  cur != null &&
                  cur >= 1 &&
                  cur <= 90 &&
                  !(NEIGHBOR_WINDOW_PRESET_DAYS as readonly number[]).includes(cur)
                ) {
                  onWhaleTxWindowDaysChange(cur);
                } else if (cur != null && cur >= 1 && cur <= 90) {
                  onWhaleTxWindowDaysChange(10);
                } else {
                  onWhaleTxWindowDaysChange(14);
                }
              } else {
                onWhaleTxWindowDaysChange(Number(v));
              }
            }}
            aria-label="Transaction window for neighbor discovery"
          >
            <option value="1">Last 1 day</option>
            <option value="2">Last 2 days</option>
            <option value="3">Last 3 days</option>
            <option value="5">Last 5 days</option>
            <option value="7">Last 7 days</option>
            <option value="15">Last 15 days</option>
            <option value="30">Last 30 days</option>
            <option value="custom">Custom (1–90 days)</option>
            <option value="full">Full history</option>
          </select>
          {neighborWindowSelectKey(whaleTxWindowDays) === "custom" && (
            <>
              <label className="ui-whale-field-label ui-mt-tight" htmlFor="whale-neighbor-custom-days">
                Custom days (1–90)
              </label>
              <input
                id="whale-neighbor-custom-days"
                type="number"
                min={1}
                max={90}
                step={1}
                className="ui-whale-field-control"
                value={whaleTxWindowDays != null ? whaleTxWindowDays : 14}
                onChange={(e) => {
                  const raw = parseInt(e.target.value, 10);
                  if (!Number.isFinite(raw)) return;
                  onWhaleTxWindowDaysChange(Math.max(1, Math.min(90, raw)));
                }}
                aria-label="Custom neighbor window in days"
              />
            </>
          )}
          <label className="ui-whale-field-label ui-mt-tight">Search depth (graph levels)</label>
          <select
            className="ui-whale-field-control"
            value={String(whaleMaxLevels)}
            onChange={(e) => onWhaleMaxLevelsChange(Number(e.target.value))}
            aria-label="Maximum BFS depth for whale map scan"
          >
            <option value="1">1 level (root only)</option>
            <option value="2">2 levels (root + neighbors)</option>
            <option value="3">3 levels</option>
            <option value="4">4 levels</option>
            <option value="5">5 levels</option>
          </select>
          <label className="ui-whale-field-label ui-mt-tight">Telegram (optional extra chat)</label>
          <input
            type="text"
            className="ui-whale-field-control"
            placeholder="Leave empty to use only server TELEGRAM_CHAT_ID"
            value={whaleTelegramForScan}
            onChange={(e) => onWhaleTelegramForScanChange(e.target.value)}
            aria-label="Optional extra Telegram chat or channel id"
            autoComplete="off"
          />
        </div>
      </details>
    </Fragment>
  );
}
