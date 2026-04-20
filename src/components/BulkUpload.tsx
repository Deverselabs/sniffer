import { useMemo, useRef, useState } from "react";
import type { DragEvent } from "react";
import { fetchWalletData } from "../api";
import { ETHERSCAN_API_KEY } from "../api/config";
import { downloadCsv } from "../utils/exportCsv";
import { shortAddr } from "../utils/format";
import {
  computeWhaleScore,
  INDUSTRY_PROFILES,
  type IndustryProfile,
} from "../utils/whaleScore";

const ADDRESS_REGEX = /^0x[a-fA-F0-9]{40}$/;
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

export function BulkUpload({ onAddressSelect, profile }: BulkUploadProps) {
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
      if (ADDRESS_REGEX.test(candidate)) {
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
    setParseError(limited.length === 0 ? "No valid Ethereum addresses found." : null);
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
        const data = await fetchWalletData(address, ETHERSCAN_API_KEY);
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
        "etherscan_link",
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
        `https://etherscan.io/address/${row.address}`,
      ]),
    ];

    const date = new Date().toISOString().slice(0, 10);
    downloadCsv(`whale-radar-results-${date}.csv`, csvRows);
  }

  return (
    <section className="space-y-4">
      <div
        onDrop={handleDrop}
        onDragOver={(event) => event.preventDefault()}
        onClick={() => fileInputRef.current?.click()}
        className="cursor-pointer rounded-xl border-2 border-dashed border-gray-300 bg-gray-50 px-4 py-8 text-center transition hover:border-gray-500 hover:bg-gray-100"
      >
        <p className="text-sm font-semibold text-gray-900">Upload CSV of wallet addresses</p>
        <p className="mt-1 text-xs text-gray-600">
          One address per row. First column must be the address. Column header optional. Max 100
          addresses.
        </p>
        {fileName && <p className="mt-3 text-sm text-gray-800">Selected file: {fileName}</p>}
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv"
          onChange={(event) => handleFileSelect(event.target.files?.[0] ?? null)}
          className="hidden"
        />
      </div>

      {parseError && (
        <section className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {parseError}
        </section>
      )}

      {addresses.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm text-gray-700">Found {addresses.length} valid addresses</p>
          {skippedRows > 0 && (
            <p className="text-sm text-amber-700">{skippedRows} row(s) were skipped.</p>
          )}
          <button
            type="button"
            onClick={runScan}
            disabled={isScanning}
            className="rounded-lg bg-gray-900 px-5 py-2 text-sm font-medium text-white transition hover:bg-black disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isScanning ? "Scanning..." : "Run Whale Radar on all"}
          </button>
        </div>
      )}

      {isScanning && (
        <div className="space-y-2 rounded-lg border border-gray-200 bg-white p-3">
          <p className="text-sm text-gray-700">
            Scanning {progress.current} of {progress.total}...
          </p>
          <div className="h-2.5 w-full rounded-full bg-gray-100">
            <div
              className="h-2.5 rounded-full bg-indigo-500 transition-all"
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
        <div className="space-y-3">
          <p className="text-sm text-gray-600">
            Scored using: {INDUSTRY_PROFILES[profile].emoji} {INDUSTRY_PROFILES[profile].label}{" "}
            profile
          </p>
          <button
            type="button"
            onClick={handleDownloadCsv}
            className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
          >
            Download scored results as CSV
          </button>
          <div className="overflow-x-auto rounded-xl border border-gray-200">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 text-left text-gray-600">
                <tr>
                  <th className="cursor-pointer px-3 py-2 font-medium" onClick={() => toggleSort("address")}>
                    Address
                  </th>
                  <th className="cursor-pointer px-3 py-2 font-medium" onClick={() => toggleSort("score")}>
                    Whale Score
                  </th>
                  <th className="cursor-pointer px-3 py-2 font-medium" onClick={() => toggleSort("tier")}>
                    Tier label
                  </th>
                  <th className="cursor-pointer px-3 py-2 font-medium" onClick={() => toggleSort("balanceEth")}>
                    ETH Balance
                  </th>
                  <th
                    className="cursor-pointer px-3 py-2 font-medium"
                    onClick={() => toggleSort("totalEthReceived")}
                  >
                    Total ETH Received
                  </th>
                  <th
                    className="cursor-pointer px-3 py-2 font-medium"
                    onClick={() => toggleSort("incomingTxns")}
                  >
                    Incoming Txns
                  </th>
                  <th
                    className="cursor-pointer px-3 py-2 font-medium"
                    onClick={() => toggleSort("uniqueSenders")}
                  >
                    Unique Senders
                  </th>
                  <th
                    className="cursor-pointer px-3 py-2 font-medium"
                    onClick={() => toggleSort("walletAgeDays")}
                  >
                    Wallet Age (days)
                  </th>
                  <th
                    className="cursor-pointer px-3 py-2 font-medium"
                    onClick={() => toggleSort("gamblingInteractions")}
                  >
                    Gambling Interactions
                  </th>
                </tr>
              </thead>
              <tbody>
                {sortedRows.map((row) => (
                  <tr key={row.address} className="border-t border-gray-100">
                    <td className="px-3 py-2">
                      <button
                        type="button"
                        onClick={() => onAddressSelect(row.address)}
                        className="font-medium text-indigo-600 hover:underline"
                      >
                        {shortAddr(row.address)}
                      </button>
                    </td>
                    <td className="px-3 py-2">
                      {row.error ? (
                        <span className="text-red-700">Error</span>
                      ) : (
                        <span className="font-semibold text-gray-900">{row.score}</span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {row.error ? (
                        <span className="text-red-700">Error</span>
                      ) : (
                        <span
                          className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${tierBadgeClass(row.tierColor)}`}
                        >
                          {row.tier}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2">{row.error ? "-" : row.balanceEth.toFixed(4)}</td>
                    <td className="px-3 py-2">{row.error ? "-" : row.totalEthReceived.toFixed(4)}</td>
                    <td className="px-3 py-2">{row.error ? "-" : row.incomingTxns}</td>
                    <td className="px-3 py-2">{row.error ? "-" : row.uniqueSenders}</td>
                    <td className="px-3 py-2">{row.error ? "-" : Math.floor(row.walletAgeDays)}</td>
                    <td className="px-3 py-2">{row.error ? "-" : row.gamblingInteractions}</td>
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
