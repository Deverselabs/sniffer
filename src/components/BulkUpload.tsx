import { useMemo, useRef, useState } from "react";
import type { DragEvent } from "react";
import { fetchWalletData } from "../api";
import type { Chain } from "../api";
import { downloadCsv } from "../utils/exportCsv";
import { explorerBase, isValidAddressForChain } from "../utils/address";
import { shortAddr } from "../utils/format";
import {
  computeWhaleScore,
  INDUSTRY_PROFILES,
  type IndustryProfile,
} from "../utils/whaleScore";

const MAX_ADDRESSES = 100;

type SortKey =
  | "address"
  | "score"
  | "tier"
  | "balanceEth"
  | "totalEthReceived"
  | "incomingTxns"
  | "uniqueSenders"
  | "walletAgeDays"
  | "gamblingInteractions";

interface BulkUploadProps {
  onAddressSelect: (address: string) => void;
  profile: IndustryProfile;
  chain: Chain;
  /** Return to main landing (hero) without leaving bulk mode parent — caller resets mode */
  onCloseToLanding?: () => void;
}

interface ScannedRow {
  address: string;
  error: string | null;
  score: number;
  tier: string;
  tierColor: "green" | "purple" | "blue" | "amber" | "red";
  balanceEth: number;
  totalEthReceived: number;
  incomingTxns: number;
  uniqueSenders: number;
  walletAgeDays: number;
  gamblingInteractions: number;
  tierBreakdown: Record<string, number>;
}

function parseFirstColumn(row: string): string {
  const col = row.split(",")[0] ?? "";
  return col.trim().replace(/^"|"$/g, "");
}

function tierBadgeClass(color: "green" | "purple" | "blue" | "amber" | "red") {
  if (color === "green") return "bg-emerald-100 text-emerald-700";
  if (color === "purple") return "bg-purple-100 text-purple-700";
  if (color === "blue") return "bg-blue-100 text-blue-700";
  if (color === "amber") return "bg-amber-100 text-amber-700";
  return "bg-red-100 text-red-700";
}

function sleep(ms: number) {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

export function BulkUpload({ onAddressSelect, profile, chain, onCloseToLanding }: BulkUploadProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [fileName, setFileName] = useState<string>("");
  const [addresses, setAddresses] = useState<string[]>([]);
  const [skippedRows, setSkippedRows] = useState<number>(0);
  const [parseError, setParseError] = useState<string | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [rows, setRows] = useState<ScannedRow[]>([]);
  const [sortKey, setSortKey] = useState<SortKey>("score");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");

  function parseCsvText(text: string) {
    const rawLines = text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0);

    if (rawLines.length === 0) {
      setAddresses([]);
      setSkippedRows(0);
      setRows([]);
      setParseError("CSV is empty.");
      return;
    }

    const firstCell = parseFirstColumn(rawLines[0]);
    const lines = firstCell.startsWith("0x") ? rawLines : rawLines.slice(1);

    const validAddresses: string[] = [];
    let skipped = rawLines.length - lines.length;

    for (const line of lines) {
      const candidate = parseFirstColumn(line);
      if (isValidAddressForChain(candidate, chain)) {
        validAddresses.push(candidate);
      } else {
        skipped += 1;
      }
    }

    const limited = validAddresses.slice(0, MAX_ADDRESSES);
    skipped += validAddresses.length - limited.length;

    setAddresses(limited);
    setSkippedRows(skipped);
    setRows([]);
    setParseError(limited.length === 0 ? `No valid ${chain} addresses found.` : null);
  }

  function readCsvFile(file: File) {
    if (!file.name.toLowerCase().endsWith(".csv")) {
      setParseError("Please upload a .csv file.");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const text = typeof reader.result === "string" ? reader.result : "";
      parseCsvText(text);
    };
    reader.onerror = () => {
      setParseError("Could not read this file. Try another CSV.");
    };
    reader.readAsText(file);
  }

  function handleFileSelect(file: File | null) {
    if (!file) return;
    setFileName(file.name);
    setParseError(null);
    readCsvFile(file);
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    const file = event.dataTransfer.files?.[0] ?? null;
    handleFileSelect(file);
  }

  function resetCsvUpload() {
    setFileName("");
    setAddresses([]);
    setSkippedRows(0);
    setRows([]);
    setParseError(null);
    setProgress({ current: 0, total: 0 });
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }

  function openFilePicker() {
    fileInputRef.current?.click();
  }

  async function runScan() {
    if (addresses.length === 0 || isScanning) return;

    setIsScanning(true);
    setRows([]);
    setProgress({ current: 0, total: addresses.length });

    const results: ScannedRow[] = [];

    for (let i = 0; i < addresses.length; i += 1) {
      const address = addresses[i];
      setProgress({ current: i + 1, total: addresses.length });

      try {
        const data = await fetchWalletData(address, chain);
        const score = computeWhaleScore(data, profile);
        results.push({
          address,
          error: null,
          score: score.total,
          tier: score.tier,
          tierColor: score.tierColor,
          balanceEth: data.balanceEth,
          totalEthReceived: score.totalEthReceived,
          incomingTxns: data.incomingTx.length,
          uniqueSenders: data.uniqueSenders,
          walletAgeDays: score.walletAgeDays,
          gamblingInteractions: score.gamblingTxCount,
          tierBreakdown: Object.fromEntries(score.tiers.map((t) => [t.label, t.points])),
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to fetch";
        results.push({
          address,
          error: message,
          score: -1,
          tier: "Error",
          tierColor: "red",
          balanceEth: 0,
          totalEthReceived: 0,
          incomingTxns: 0,
          uniqueSenders: 0,
          walletAgeDays: 0,
          gamblingInteractions: 0,
          tierBreakdown: {},
        });
      }

      setRows([...results]);
      if (i < addresses.length - 1) {
        await sleep(300);
      }
    }

    setIsScanning(false);
  }

  function toggleSort(nextKey: SortKey) {
    if (sortKey === nextKey) {
      setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
      return;
    }
    setSortKey(nextKey);
    setSortDirection(nextKey === "score" ? "desc" : "asc");
  }

  const sortedRows = useMemo(() => {
    const dir = sortDirection === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => {
      const aVal =
        sortKey === "address"
          ? a.address.toLowerCase()
          : sortKey === "score"
            ? a.score
            : sortKey === "tier"
              ? a.tier
              : sortKey === "balanceEth"
                ? a.balanceEth
                : sortKey === "totalEthReceived"
                  ? a.totalEthReceived
                  : sortKey === "incomingTxns"
                    ? a.incomingTxns
                    : sortKey === "uniqueSenders"
                      ? a.uniqueSenders
                      : sortKey === "walletAgeDays"
                        ? a.walletAgeDays
                        : a.gamblingInteractions;

      const bVal =
        sortKey === "address"
          ? b.address.toLowerCase()
          : sortKey === "score"
            ? b.score
            : sortKey === "tier"
              ? b.tier
              : sortKey === "balanceEth"
                ? b.balanceEth
                : sortKey === "totalEthReceived"
                  ? b.totalEthReceived
                  : sortKey === "incomingTxns"
                    ? b.incomingTxns
                    : sortKey === "uniqueSenders"
                      ? b.uniqueSenders
                      : sortKey === "walletAgeDays"
                        ? b.walletAgeDays
                        : b.gamblingInteractions;

      if (typeof aVal === "string" && typeof bVal === "string") {
        return aVal.localeCompare(bVal) * dir;
      }

      return ((aVal as number) - (bVal as number)) * dir;
    });
  }, [rows, sortDirection, sortKey]);

  function handleDownloadCsv() {
    const exportRows = [...rows].sort((a, b) => b.score - a.score);
    const csvRows: string[][] = [
      [
        "address",
        "whale_score",
        "tier",
        "eth_balance",
        "total_eth_received",
        "incoming_txns",
        "unique_senders",
        "wallet_age_days",
        "gambling_interactions",
        "t1_wallet_wealth",
        "t2_gambling_signal",
        "t3_transaction_volume",
        "t4_wallet_age",
        "t5_unique_senders",
        "t6_avg_deposit_size",
        "t7_recent_activity",
        "t8_large_deposit_count",
        "t9_balance_strength",
        "t10_risk_adjustment",
        "explorer_link",
      ],
      ...exportRows.map((row) => [
        row.address,
        row.error ? "Error" : String(row.score),
        row.tier,
        row.error ? "" : row.balanceEth.toFixed(4),
        row.error ? "" : row.totalEthReceived.toFixed(4),
        row.error ? "" : String(row.incomingTxns),
        row.error ? "" : String(row.uniqueSenders),
        row.error ? "" : String(Math.floor(row.walletAgeDays)),
        row.error ? "" : String(row.gamblingInteractions),
        row.error ? "" : String(row.tierBreakdown["T1 Wallet Wealth"] ?? 0),
        row.error ? "" : String(row.tierBreakdown["T2 Gambling Signal"] ?? 0),
        row.error ? "" : String(row.tierBreakdown["T3 Transaction Volume"] ?? 0),
        row.error ? "" : String(row.tierBreakdown["T4 Wallet Age"] ?? 0),
        row.error ? "" : String(row.tierBreakdown["T5 Unique Senders"] ?? 0),
        row.error ? "" : String(row.tierBreakdown["T6 Avg Deposit Size"] ?? 0),
        row.error ? "" : String(row.tierBreakdown["T7 Recent Activity"] ?? 0),
        row.error ? "" : String(row.tierBreakdown["T8 Large Deposit Count"] ?? 0),
        row.error ? "" : String(row.tierBreakdown["T9 Balance Strength"] ?? 0),
        row.error ? "" : String(row.tierBreakdown["T10 Risk Adjustment"] ?? 0),
        `${explorerBase(chain)}/address/${row.address}`,
      ]),
    ];

    const date = new Date().toISOString().slice(0, 10);
    downloadCsv(`whale-radar-results-${date}.csv`, csvRows);
  }

  return (
    <section className="ui-surface ui-stack ui-panel-bulk">
      <div className="ui-row-between items-start">
        <div>
          <h2 className="ui-section-title">Bulk sniff</h2>
          <p className="ui-lede">Upload a CSV, run all wallets, export for BI tools.</p>
        </div>
        <div className="ui-row shrink-0">
          {(fileName || addresses.length > 0 || rows.length > 0) && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                resetCsvUpload();
                openFilePicker();
              }}
              className="ui-btn ui-btn--ghost ui-btn-tiny"
            >
              Another CSV
            </button>
          )}
          {onCloseToLanding && (
            <button
              type="button"
              title="Close and return to landing"
              aria-label="Close bulk upload and return to landing page"
              onClick={(e) => {
                e.stopPropagation();
                onCloseToLanding();
              }}
              className="ui-btn ui-btn-close ui-btn--square"
            >
              ×
            </button>
          )}
        </div>
      </div>

      <div
        onDrop={handleDrop}
        onDragOver={(event) => event.preventDefault()}
        onClick={() => openFilePicker()}
        className="ui-dropzone"
      >
        <p className="ui-text-body font-semibold text-[rgba(255,255,255,0.85)]">
          Upload CSV of wallet addresses
        </p>
        <p className="ui-text-caption ui-mt-tight">
          One address per row. First column must be the address. Column header optional. Max 100
          addresses.
        </p>
        {fileName && (
          <p className="ui-text-body ui-mt font-mono text-[rgba(175,169,236,0.9)]">Selected file: {fileName}</p>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv"
          onChange={(event) => handleFileSelect(event.target.files?.[0] ?? null)}
          className="hidden"
        />
      </div>

      {parseError && <section className="ui-banner-danger">{parseError}</section>}

      {addresses.length > 0 && (
        <div className="ui-stack-tight">
          <p className="ui-text-mono-muted">
            Found {addresses.length} valid {chain.toUpperCase()} addresses
          </p>
          {skippedRows > 0 && (
            <p className="ui-text-body text-amber-300/90">{skippedRows} row(s) were skipped.</p>
          )}
          <div className="ui-row">
            <button type="button" className="ui-btn ui-btn--primary" onClick={runScan} disabled={isScanning}>
              {isScanning ? "Scanning..." : "Run Whale Radar on all"}
            </button>
            <button
              type="button"
              className="ui-btn ui-btn--ghost"
              onClick={(e) => {
                e.stopPropagation();
                resetCsvUpload();
                openFilePicker();
              }}
              disabled={isScanning}
            >
              Choose different file
            </button>
          </div>
        </div>
      )}

      {isScanning && (
        <div className="ui-stack-tight ui-card ui-card--muted">
          <p className="ui-text-mono-muted">
            Scanning {progress.current} of {progress.total}...
          </p>
          <div className="ui-progress-track">
            <div
              className="ui-progress-fill"
              style={{
                width:
                  progress.total > 0
                    ? `${Math.round((progress.current / progress.total) * 100)}%`
                    : "0%",
              }}
            />
          </div>
        </div>
      )}

      {!isScanning && rows.length > 0 && (
        <div className="ui-stack-tight">
          <p className="ui-text-body text-[rgba(255,255,255,0.45)]">
            Scored using: {INDUSTRY_PROFILES[profile].emoji} {INDUSTRY_PROFILES[profile].label} profile
          </p>
          <div className="ui-row">
            <button type="button" className="ui-btn ui-btn--ghost" onClick={handleDownloadCsv}>
              Download scored results as CSV
            </button>
            <button
              type="button"
              className="ui-btn ui-btn--ghost"
              style={{ borderColor: "rgba(255,255,255,0.12)", color: "rgba(255,255,255,0.45)" }}
              onClick={() => {
                resetCsvUpload();
              }}
            >
              Load another CSV
            </button>
          </div>
          <div className="ui-table-wrap">
            <table className="ui-table">
              <thead>
                <tr>
                  <th className="ui-th-sort" onClick={() => toggleSort("address")}>
                    Address
                  </th>
                  <th className="ui-th-sort" onClick={() => toggleSort("score")}>
                    Whale Score
                  </th>
                  <th className="ui-th-sort" onClick={() => toggleSort("tier")}>
                    Tier label
                  </th>
                  <th className="ui-th-sort" onClick={() => toggleSort("balanceEth")}>
                    ETH Balance
                  </th>
                  <th className="ui-th-sort" onClick={() => toggleSort("totalEthReceived")}>
                    Total ETH Received
                  </th>
                  <th className="ui-th-sort" onClick={() => toggleSort("incomingTxns")}>
                    Incoming Txns
                  </th>
                  <th className="ui-th-sort" onClick={() => toggleSort("uniqueSenders")}>
                    Unique Senders
                  </th>
                  <th className="ui-th-sort" onClick={() => toggleSort("walletAgeDays")}>
                    Wallet Age (days)
                  </th>
                  <th className="ui-th-sort" onClick={() => toggleSort("gamblingInteractions")}>
                    Gambling Interactions
                  </th>
                </tr>
              </thead>
              <tbody>
                {sortedRows.map((row) => (
                  <tr key={row.address}>
                    <td>
                      <button type="button" className="ui-link font-medium" onClick={() => onAddressSelect(row.address)}>
                        {shortAddr(row.address)}
                      </button>
                    </td>
                    <td>
                      {row.error ? (
                        <span className="text-[#ffb3b2]">Error</span>
                      ) : (
                        <span className="font-semibold text-white">{row.score}</span>
                      )}
                    </td>
                    <td>
                      {row.error ? (
                        <span className="text-[#ffb3b2]">Error</span>
                      ) : (
                        <span className={`ui-badge-row ${tierBadgeClass(row.tierColor)}`}>{row.tier}</span>
                      )}
                    </td>
                    <td>{row.error ? "-" : row.balanceEth.toFixed(4)}</td>
                    <td>{row.error ? "-" : row.totalEthReceived.toFixed(4)}</td>
                    <td>{row.error ? "-" : row.incomingTxns}</td>
                    <td>{row.error ? "-" : row.uniqueSenders}</td>
                    <td>{row.error ? "-" : Math.floor(row.walletAgeDays)}</td>
                    <td>{row.error ? "-" : row.gamblingInteractions}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}
