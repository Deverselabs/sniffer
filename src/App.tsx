import { useEffect, useState } from "react";
import { fetchRecentAlerts } from "./api";
import type { Chain, WalletData, WhaleNetworkStartOptions } from "./api";
import { BulkUpload } from "./components/BulkUpload";
import DogLogo from "./components/DogLogo";
import { MetricsBar } from "./components/MetricsBar";
import { TransactionList } from "./components/TransactionList";
import { WhaleRadar } from "./components/WhaleRadar";
import { useWhaleNetworkScan } from "./hooks/useWhaleNetworkScan";
import { useWalletData } from "./hooks/useWalletData";
import { detectChain, isValidAddressForChain } from "./utils/address";
import { INDUSTRY_PROFILES, type IndustryProfile } from "./utils/whaleScore";

type View =
  | { level: "root" }
  | { level: "sender"; address: string; parentAddress: string };

function App() {
  const [view, setView] = useState<View>({ level: "root" });
  const [mode, setMode] = useState<"single" | "bulk">("single");
  const [profile, setProfile] = useState<IndustryProfile>("casino");
  const [chain, setChain] = useState<Chain>("ethereum");
  const [address, setAddress] = useState("");
  const [toasts, setToasts] = useState<Array<{ id: string; text: string }>>([]);
  const [whaleTxWindowDays, setWhaleTxWindowDays] = useState<number | null>(5);
  const [whaleMaxLevels, setWhaleMaxLevels] = useState(2);
  const [whaleTelegramForScan, setWhaleTelegramForScan] = useState("");
  const rootWallet = useWalletData();
  const senderWallet = useWalletData();
  const whaleNetwork = useWhaleNetworkScan();
  const {
    job: whaleNetworkJob,
    loading: whaleNetworkLoading,
    error: whaleNetworkError,
    start: startWhaleNetworkScan,
    cancel: cancelWhaleNetworkScan,
    pausePolling: pauseWhaleNetworkPolling,
  } = whaleNetwork;

  const CHAINS = [
    { id: "ethereum", label: "ETH", color: "#627EEA", soon: false },
    { id: "solana", label: "SOL", color: "#9945FF", soon: false },
    { id: "tron", label: "TRX", color: "#FF0013", soon: false },
  ] as const;

  function changeChain(next: Chain) {
    setChain(next);
    setView({ level: "root" });
    rootWallet.clear();
    senderWallet.clear();
  }

  async function handleRootSubmit(address: string, selectedChain: Chain) {
    setView({ level: "root" });
    await rootWallet.fetchWallet(address, selectedChain);
  }

  async function handleAddressClick(address: string, sourceWallet: WalletData) {
    setView({
      level: "sender",
      address,
      parentAddress: sourceWallet.address,
    });
    await senderWallet.fetchWallet(address, sourceWallet.chain);
  }

  const activeData = view.level === "root" ? rootWallet.data : senderWallet.data;
  const activeLoading = view.level === "root" ? rootWallet.loading : senderWallet.loading;
  const activeError = view.level === "root" ? rootWallet.error : senderWallet.error;
  const activeLensScores = view.level === "root" ? rootWallet.lensScores : senderWallet.lensScores;
  const activeLensScoresLoading = view.level === "root" ? rootWallet.lensScoresLoading : senderWallet.lensScoresLoading;
  const activeLensScoresError = view.level === "root" ? rootWallet.lensScoresError : senderWallet.lensScoresError;
  const activeReloadLensScores = view.level === "root" ? rootWallet.reloadLensScores : senderWallet.reloadLensScores;

  useEffect(() => {
    if (activeData) {
      setWhaleTelegramForScan("");
      setWhaleTxWindowDays(5);
      setWhaleMaxLevels(2);
    }
  }, [activeData?.address, activeData?.chain]);

  useEffect(() => {
    if (!activeData || mode !== "single") {
      pauseWhaleNetworkPolling();
      return;
    }
    const tg = whaleTelegramForScan.trim();
    if (!tg) {
      pauseWhaleNetworkPolling();
      return;
    }
    const opts: WhaleNetworkStartOptions = {
      tx_window_days: whaleTxWindowDays,
      max_levels: whaleMaxLevels,
      telegram_chat_id: tg,
    };
    void startWhaleNetworkScan(activeData.address, activeData.chain, opts);
  }, [
    activeData,
    mode,
    whaleTxWindowDays,
    whaleMaxLevels,
    whaleTelegramForScan,
    startWhaleNetworkScan,
    pauseWhaleNetworkPolling,
  ]);

  function goBack() {
    setView({ level: "root" });
  }

  function goToLanding() {
    setView({ level: "root" });
    setMode("single");
    setAddress("");
    rootWallet.clear();
    senderWallet.clear();
  }

  function handleTrack() {
    const trimmed = address.trim();
    const detected = detectChain(trimmed);
    if (detected && detected !== chain) {
      setChain(detected);
    }
    const activeChain = detected ?? chain;
    if (!isValidAddressForChain(trimmed, activeChain)) return;
    void handleRootSubmit(trimmed, activeChain);
  }

  useEffect(() => {
    let mounted = true;
    async function pollAlerts() {
      try {
        const data = await fetchRecentAlerts();
        if (!mounted) return;
        const next = data.items.slice(0, 3).map((item) => ({
          id: `${item.address}-${item.score}-${item.created_at ?? ""}`,
          text: `${item.chain.toUpperCase()} whale ${item.address.slice(0, 6)}... score ${item.score}`,
        }));
        setToasts(next);
      } catch {
        return;
      }
    }
    void pollAlerts();
    const timer = window.setInterval(() => {
      void pollAlerts();
    }, 30000);
    return () => {
      mounted = false;
      window.clearInterval(timer);
    };
  }, []);

  return (
    <div className="app-shell">
      <div className="app-scanline" />
      <div className="app-toast-stack">
        {toasts.map((toast) => (
          <div key={toast.id} className="app-toast">
            Whale alert: {toast.text}
          </div>
        ))}
      </div>

      <nav className="app-nav">
        <button
          type="button"
          onClick={goToLanding}
          title="Back to landing page"
          aria-label="Back to landing page"
          className="header-brand-btn"
        >
          <DogLogo />
          <div className="min-w-0">
            <div className="header-brand-title truncate">sniffer</div>
            <div className="header-brand-subtitle truncate">whale radar</div>
          </div>
        </button>
        <div className="app-nav-meta">
          <div className="app-status-pill">
            <div className="app-status-dot" />
            SYS:ONLINE // ETH:MAINNET
          </div>
          <span className="app-nav-link">pricing</span>
          <span className="app-nav-link">docs</span>
        </div>
      </nav>

      {!activeData && view.level === "root" && mode === "single" && (
        <div className="app-hero">
          <div className="app-hero-kicker">
            <div className="app-hero-rule app-hero-rule--l" />
            on-chain intelligence
            <div className="app-hero-rule app-hero-rule--r" />
          </div>

          <h1 className="app-hero-h1">
            sniff every
            <br />
            <span className="app-hero-h1-accent">wallet.</span>
          </h1>

          <div className="app-hero-lede">
            <span style={{ color: "rgba(127,119,221,0.45)" }}>// </span>
            score any deposit 0–100 in seconds
            <br />
            <span style={{ color: "rgba(127,119,221,0.45)" }}>// </span>
            know if your depositor is a whale before they leave
            <br />
            <span style={{ color: "rgba(127,119,221,0.45)" }}>// </span>
            built for casinos · exchanges · defi protocols
          </div>

          <div className="app-chain-row">
            {CHAINS.map((c) => (
              <button
                key={c.id}
                type="button"
                disabled={c.soon}
                data-active={chain === c.id ? "true" : "false"}
                className="app-chain-btn"
                onClick={() => !c.soon && changeChain(c.id)}
              >
                <span
                  className="app-chain-swatch"
                  style={{
                    background: c.color,
                    boxShadow: chain === c.id ? `0 0 0.375em ${c.color}` : "none",
                  }}
                />
                {c.label}
                {c.soon ? " — soon" : ""}
              </button>
            ))}
          </div>

          <select
            className="app-profile-select"
            value={profile}
            onChange={(e) => setProfile(e.target.value as IndustryProfile)}
          >
            {Object.entries(INDUSTRY_PROFILES).map(([k, p]) => (
              <option key={k} value={k} style={{ background: "#0d0d18" }}>
                {p.emoji} {p.label}
              </option>
            ))}
          </select>

          <div className="app-mode-toggle">
            {(["single", "bulk"] as const).map((m) => (
              <button
                key={m}
                type="button"
                data-active={mode === m ? "true" : "false"}
                className="app-mode-btn"
                onClick={() => setMode(m)}
              >
                {m === "single" ? "single" : "bulk"}
              </button>
            ))}
          </div>

          <div className="app-sniff-row">
            <input
              className="app-sniff-input"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleTrack()}
              disabled={activeLoading}
              placeholder="// paste wallet address..."
            />
            <button
              type="button"
              className="app-sniff-submit"
              onClick={handleTrack}
              disabled={activeLoading}
            >
              {activeLoading ? "SNIFFING..." : "SNIFF →"}
            </button>
          </div>
        </div>
      )}

      <div className="app-main">
        {(activeData || view.level !== "root" || mode === "bulk") && (
          <>
            {view.level === "sender" && (
              <button type="button" className="app-back-btn" onClick={goBack}>
                ← back to {view.parentAddress.slice(0, 6)}...{view.parentAddress.slice(-4)}
              </button>
            )}

            {!activeData && mode !== "bulk" && (
              <div className="app-mode-toggle app-mode-toggle--inline">
                {(["single", "bulk"] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    data-active={mode === m ? "true" : "false"}
                    className="app-mode-btn"
                    onClick={() => setMode(m)}
                  >
                    {m}
                  </button>
                ))}
              </div>
            )}

            {activeError && <section className="app-banner-error">{activeError}</section>}

            {activeLoading && (
              <section className="app-banner-loading">
                <span className="app-spinner" aria-hidden />
                Fetching wallet data...
              </section>
            )}

            {mode === "bulk" ? (
              <BulkUpload
                chain={chain}
                profile={profile}
                onCloseToLanding={goToLanding}
                onAddressSelect={(addr) => {
                  setMode("single");
                  setAddress(addr);
                  void handleRootSubmit(addr, chain);
                }}
              />
            ) : (
              <div className="ui-stack">
                {activeData && (
                  <WhaleRadar
                    data={activeData}
                    profile={profile}
                    lensScores={activeLensScores}
                    lensScoresLoading={activeLensScoresLoading}
                    lensScoresError={activeLensScoresError}
                    onRetryLensScores={activeReloadLensScores}
                    whaleTxWindowDays={whaleTxWindowDays}
                    onWhaleTxWindowDaysChange={setWhaleTxWindowDays}
                    whaleMaxLevels={whaleMaxLevels}
                    onWhaleMaxLevelsChange={setWhaleMaxLevels}
                    whaleTelegramForScan={whaleTelegramForScan}
                    onWhaleTelegramForScanChange={setWhaleTelegramForScan}
                    whaleNetworkJob={whaleNetworkJob}
                    whaleNetworkLoading={whaleNetworkLoading}
                    whaleNetworkError={whaleNetworkError}
                    onCancelWhaleNetworkScan={cancelWhaleNetworkScan}
                    onWhaleMapWalletClick={(addr) => handleAddressClick(addr, activeData)}
                  />
                )}
                {activeData && <MetricsBar data={activeData} />}
                {activeData && (
                  <TransactionList
                    chain={activeData.chain}
                    profile={profile}
                    transactions={activeData.incomingTx}
                    onAddressClick={(addr) => handleAddressClick(addr, activeData)}
                  />
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export default App;
