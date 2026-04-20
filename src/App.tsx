import { useState } from "react";
import type { WalletData } from "./api";
import { AddressInput } from "./components/AddressInput";
import { BulkUpload } from "./components/BulkUpload";
import { MetricsBar } from "./components/MetricsBar";
import { TransactionList } from "./components/TransactionList";
import { WhaleRadar } from "./components/WhaleRadar";
import { useWalletData } from "./hooks/useWalletData";
import { shortAddr } from "./utils/format";
import { INDUSTRY_PROFILES, type IndustryProfile } from "./utils/whaleScore";

type View =
  | { level: "root" }
  | { level: "sender"; address: string; parentAddress: string };

function App() {
  const [view, setView] = useState<View>({ level: "root" });
  const [mode, setMode] = useState<"single" | "bulk">("single");
  const [profile, setProfile] = useState<IndustryProfile>("casino");
  const rootWallet = useWalletData();
  const senderWallet = useWalletData();

  async function handleRootSubmit(address: string) {
    setView({ level: "root" });
    await rootWallet.fetchWallet(address);
  }

  async function handleAddressClick(address: string, sourceWallet: WalletData) {
    setView({
      level: "sender",
      address,
      parentAddress: sourceWallet.address,
    });
    await senderWallet.fetchWallet(address);
  }

  const activeData = view.level === "root" ? rootWallet.data : senderWallet.data;
  const activeLoading = view.level === "root" ? rootWallet.loading : senderWallet.loading;
  const activeError = view.level === "root" ? rootWallet.error : senderWallet.error;

  return (
    <main className="min-h-screen bg-gray-50 px-4 py-10">
      <div className="mx-auto max-w-3xl space-y-6 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm sm:p-8">
        <header className="space-y-1">
          <h1 className="text-3xl font-semibold tracking-tight text-gray-900">
            Sniffer
          </h1>
          <p className="text-sm text-gray-600">Ethereum wallet tracker</p>
        </header>

        <div className="inline-flex rounded-lg border border-gray-200 bg-gray-50 p-1 text-sm">
          <button
            type="button"
            onClick={() => setMode("single")}
            className={`rounded-md px-3 py-1.5 font-medium transition ${
              mode === "single" ? "bg-white text-gray-900 shadow-sm" : "text-gray-600 hover:text-gray-900"
            }`}
          >
            Single Wallet
          </button>
          <button
            type="button"
            onClick={() => setMode("bulk")}
            className={`rounded-md px-3 py-1.5 font-medium transition ${
              mode === "bulk" ? "bg-white text-gray-900 shadow-sm" : "text-gray-600 hover:text-gray-900"
            }`}
          >
            Bulk Upload
          </button>
        </div>

        <div className="space-y-2">
          <select
            value={profile}
            onChange={(event) => setProfile(event.target.value as IndustryProfile)}
            className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700"
          >
            {Object.entries(INDUSTRY_PROFILES).map(([key, p]) => (
              <option key={key} value={key}>
                {p.emoji} {p.label}
              </option>
            ))}
          </select>
          <p className="text-xs text-gray-500">{INDUSTRY_PROFILES[profile].description}</p>
        </div>

        {mode === "single" && (
          <>
            <AddressInput onSubmit={handleRootSubmit} loading={rootWallet.loading} />

            {view.level === "sender" && (
              <button
                type="button"
                onClick={() => setView({ level: "root" })}
                className="text-sm font-medium text-indigo-600 transition hover:underline"
              >
                {`← Back to ${shortAddr(view.parentAddress)}`}
              </button>
            )}

            {activeError && (
              <section className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {activeError}
              </section>
            )}

            {activeLoading && (
              <section className="flex items-center gap-3 rounded-lg border border-gray-200 bg-white px-4 py-3 text-sm text-gray-600">
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-gray-300 border-t-gray-700" />
                Fetching wallet data...
              </section>
            )}

            {activeData && (
              <>
                <WhaleRadar data={activeData} profile={profile} />
                <MetricsBar data={activeData} />
                <TransactionList
                  transactions={activeData.incomingTx}
                  onAddressClick={(address) => handleAddressClick(address, activeData)}
                />
              </>
            )}
          </>
        )}

        {mode === "bulk" && (
          <BulkUpload
            profile={profile}
            onAddressSelect={(address) => {
              setMode("single");
              void handleRootSubmit(address);
            }}
          />
        )}
      </div>
    </main>
  );
}

export default App;
