import { useState } from "react";
import type { WalletData } from "./api";
import { BulkUpload } from "./components/BulkUpload";
import DogLogo from "./components/DogLogo";
import { MetricsBar } from "./components/MetricsBar";
import { TransactionList } from "./components/TransactionList";
import { WhaleRadar } from "./components/WhaleRadar";
import { useWalletData } from "./hooks/useWalletData";
import { INDUSTRY_PROFILES, type IndustryProfile } from "./utils/whaleScore";

type View =
  | { level: "root" }
  | { level: "sender"; address: string; parentAddress: string };

function App() {
  const [view, setView] = useState<View>({ level: "root" });
  const [mode, setMode] = useState<"single" | "bulk">("single");
  const [profile, setProfile] = useState<IndustryProfile>("casino");
  const [chain, setChain] = useState<"ethereum" | "solana" | "tron">("ethereum");
  const [address, setAddress] = useState("");
  const rootWallet = useWalletData();
  const senderWallet = useWalletData();

  const CHAINS = [
    { id: "ethereum", label: "ETH", color: "#627EEA", soon: false },
    { id: "solana", label: "SOL", color: "#9945FF", soon: true },
    { id: "tron", label: "TRX", color: "#FF0013", soon: true },
  ] as const;

  const ADDRESS_REGEX = /^0x[0-9a-fA-F]{40}$/;

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

  function goBack() {
    setView({ level: "root" });
  }

  function handleTrack() {
    const trimmed = address.trim();
    if (!ADDRESS_REGEX.test(trimmed)) return;
    void handleRootSubmit(trimmed);
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#050508",
        display: "flex",
        flexDirection: "column",
        position: "relative",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          height: 1,
          background: "rgba(127,119,221,0.7)",
          boxShadow: "0 0 12px rgba(127,119,221,0.5), 0 0 24px rgba(127,119,221,0.2)",
          animation: "scanline 5s ease-in-out infinite",
          zIndex: 50,
          pointerEvents: "none",
        }}
      />

      <nav
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "16px 28px",
          borderBottom: "0.5px solid rgba(127,119,221,0.15)",
          position: "relative",
          zIndex: 10,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <DogLogo />
          <div>
            <div
              style={{
                fontSize: 18,
                fontWeight: 900,
                color: "#fff",
                letterSpacing: "-1px",
                textShadow: "0 0 20px rgba(255,255,255,0.1)",
              }}
            >
              sniffer
            </div>
            <div
              style={{
                fontSize: 9,
                color: "rgba(127,119,221,0.55)",
                letterSpacing: "0.2em",
                textTransform: "uppercase",
              }}
            >
              whale radar
            </div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              fontSize: 10,
              color: "rgba(127,119,221,0.5)",
              letterSpacing: "0.1em",
              border: "0.5px solid rgba(127,119,221,0.2)",
              borderRadius: 4,
              padding: "4px 10px",
            }}
          >
            <div
              style={{
                width: 5,
                height: 5,
                borderRadius: "50%",
                background: "#1D9E75",
                animation: "pulse-dot 2s ease-in-out infinite",
              }}
            />
            SYS:ONLINE // ETH:MAINNET
          </div>
          <span
            style={{
              fontSize: 11,
              color: "rgba(255,255,255,0.2)",
              letterSpacing: "0.08em",
              cursor: "pointer",
              textTransform: "uppercase",
            }}
          >
            pricing
          </span>
          <span
            style={{
              fontSize: 11,
              color: "rgba(255,255,255,0.2)",
              letterSpacing: "0.08em",
              cursor: "pointer",
              textTransform: "uppercase",
            }}
          >
            docs
          </span>
        </div>
      </nav>

      {!activeData && view.level === "root" && mode === "single" && (
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            padding: "48px 24px 32px",
            textAlign: "center",
            position: "relative",
            zIndex: 5,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              fontSize: 10,
              color: "rgba(127,119,221,0.4)",
              letterSpacing: "0.2em",
              textTransform: "uppercase",
              marginBottom: 24,
            }}
          >
            <div
              style={{ width: 80, height: 0.5, background: "linear-gradient(90deg, transparent, rgba(127,119,221,0.3))" }}
            />
            on-chain intelligence
            <div
              style={{ width: 80, height: 0.5, background: "linear-gradient(270deg, transparent, rgba(127,119,221,0.3))" }}
            />
          </div>

          <h1
            style={{
              fontSize: 54,
              fontWeight: 900,
              color: "#fff",
              letterSpacing: "-3px",
              lineHeight: 1,
              marginBottom: 8,
              fontFamily: "'Courier New', monospace",
            }}
          >
            sniff every
            <br />
            <span
              style={{
                color: "#7F77DD",
                textShadow: "0 0 30px rgba(127,119,221,0.6), 0 0 60px rgba(127,119,221,0.2)",
              }}
            >
              wallet.
            </span>
          </h1>

          <div
            style={{
              fontSize: 11,
              color: "rgba(255,255,255,0.22)",
              marginBottom: 30,
              lineHeight: 2.2,
              fontFamily: "'Courier New', monospace",
            }}
          >
            <span style={{ color: "rgba(127,119,221,0.45)" }}>// </span>
            score any deposit 0–100 in seconds
            <br />
            <span style={{ color: "rgba(127,119,221,0.45)" }}>// </span>
            know if your depositor is a whale before they leave
            <br />
            <span style={{ color: "rgba(127,119,221,0.45)" }}>// </span>
            built for casinos · exchanges · defi protocols
          </div>

          <div style={{ display: "flex", gap: 8, marginBottom: 18 }}>
            {CHAINS.map((c) => (
              <button
                key={c.id}
                onClick={() => !c.soon && setChain(c.id)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 7,
                  padding: "7px 18px",
                  borderRadius: 6,
                  border:
                    chain === c.id
                      ? "0.5px solid rgba(127,119,221,0.45)"
                      : "0.5px solid rgba(255,255,255,0.06)",
                  background:
                    chain === c.id ? "rgba(127,119,221,0.09)" : "rgba(255,255,255,0.02)",
                  color: chain === c.id ? "#AFA9EC" : "rgba(255,255,255,0.22)",
                  fontSize: 11,
                  cursor: c.soon ? "default" : "pointer",
                  fontFamily: "'Courier New', monospace",
                  opacity: c.soon ? 0.4 : 1,
                  boxShadow: chain === c.id ? "0 0 16px rgba(127,119,221,0.1)" : "none",
                  transition: "all 0.15s",
                }}
              >
                <div
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: "50%",
                    background: c.color,
                    boxShadow: chain === c.id ? `0 0 6px ${c.color}` : "none",
                  }}
                />
                {c.label}
                {c.soon ? " — soon" : ""}
              </button>
            ))}
          </div>

          <select
            value={profile}
            onChange={(e) => setProfile(e.target.value as IndustryProfile)}
            style={{
              background: "rgba(127,119,221,0.05)",
              border: "0.5px solid rgba(127,119,221,0.2)",
              color: "rgba(255,255,255,0.4)",
              borderRadius: 6,
              padding: "7px 14px",
              fontSize: 11,
              marginBottom: 14,
              cursor: "pointer",
              outline: "none",
              fontFamily: "'Courier New', monospace",
              letterSpacing: "0.05em",
            }}
          >
            {Object.entries(INDUSTRY_PROFILES).map(([k, p]) => (
              <option key={k} value={k} style={{ background: "#0d0d18" }}>
                {p.emoji} {p.label}
              </option>
            ))}
          </select>

          <div
            style={{
              display: "flex",
              marginBottom: 16,
              border: "0.5px solid rgba(127,119,221,0.2)",
              borderRadius: 6,
              overflow: "hidden",
            }}
          >
            {(["single", "bulk"] as const).map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                style={{
                  padding: "8px 22px",
                  fontSize: 11,
                  background: mode === m ? "rgba(127,119,221,0.15)" : "transparent",
                  color: mode === m ? "#AFA9EC" : "rgba(255,255,255,0.2)",
                  border: "none",
                  cursor: "pointer",
                  fontFamily: "'Courier New', monospace",
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  fontWeight: mode === m ? 700 : 400,
                }}
              >
                {m === "single" ? "single" : "bulk"}
              </button>
            ))}
          </div>

          <div
            style={{
              display: "flex",
              width: "100%",
              maxWidth: 500,
              border: "0.5px solid rgba(127,119,221,0.3)",
              borderRadius: 10,
              overflow: "hidden",
              background: "rgba(127,119,221,0.04)",
              boxShadow: "0 0 20px rgba(127,119,221,0.06)",
              marginBottom: 24,
            }}
          >
            <input
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleTrack()}
              disabled={activeLoading || chain !== "ethereum"}
              placeholder="// paste wallet address..."
              style={{
                flex: 1,
                background: "transparent",
                border: "none",
                outline: "none",
                padding: "14px 18px",
                fontFamily: "'Courier New', monospace",
                fontSize: 12,
                color: "rgba(255,255,255,0.6)",
              }}
            />
            <button
              onClick={handleTrack}
              disabled={activeLoading || chain !== "ethereum"}
              style={{
                background: "#7F77DD",
                border: "none",
                padding: "0 24px",
                color: "#fff",
                fontFamily: "'Courier New', monospace",
                fontWeight: 900,
                fontSize: 13,
                cursor: "pointer",
                letterSpacing: "0.05em",
                opacity: activeLoading || chain !== "ethereum" ? 0.5 : 1,
              }}
            >
              {activeLoading ? "SNIFFING..." : "SNIFF →"}
            </button>
          </div>

        </div>
      )}

      <div style={{ maxWidth: 780, margin: "0 auto", width: "100%", padding: "24px", position: "relative", zIndex: 5 }}>
        {(activeData || view.level !== "root" || mode === "bulk") && (
          <>
            {view.level === "sender" && (
              <button
                onClick={goBack}
                style={{
                  background: "none",
                  border: "none",
                  color: "rgba(255,255,255,0.3)",
                  fontSize: 12,
                  cursor: "pointer",
                  marginBottom: 16,
                  fontFamily: "'Courier New', monospace",
                  letterSpacing: "0.05em",
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                ← back to {view.parentAddress.slice(0, 6)}...{view.parentAddress.slice(-4)}
              </button>
            )}

            {!activeData && mode !== "bulk" && (
              <div
                style={{
                  display: "flex",
                  marginBottom: 16,
                  border: "0.5px solid rgba(127,119,221,0.2)",
                  borderRadius: 6,
                  overflow: "hidden",
                  width: "fit-content",
                }}
              >
                {(["single", "bulk"] as const).map((m) => (
                  <button
                    key={m}
                    onClick={() => setMode(m)}
                    style={{
                      padding: "8px 22px",
                      fontSize: 11,
                      background: mode === m ? "rgba(127,119,221,0.15)" : "transparent",
                      color: mode === m ? "#AFA9EC" : "rgba(255,255,255,0.2)",
                      border: "none",
                      cursor: "pointer",
                      fontFamily: "'Courier New', monospace",
                      letterSpacing: "0.08em",
                      textTransform: "uppercase",
                    }}
                  >
                    {m}
                  </button>
                ))}
              </div>
            )}

            {activeError && (
              <section
                style={{
                  borderRadius: 8,
                  border: "0.5px solid rgba(226,75,74,0.35)",
                  background: "rgba(226,75,74,0.1)",
                  padding: "12px 14px",
                  color: "#ffb3b2",
                  fontSize: 12,
                  marginBottom: 14,
                }}
              >
                {activeError}
              </section>
            )}

            {activeLoading && (
              <section
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  borderRadius: 8,
                  border: "0.5px solid rgba(127,119,221,0.2)",
                  background: "rgba(127,119,221,0.05)",
                  padding: "12px 14px",
                  color: "rgba(255,255,255,0.5)",
                  fontSize: 12,
                  marginBottom: 14,
                }}
              >
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-indigo-300 border-t-indigo-100" />
                Fetching wallet data...
              </section>
            )}

            {mode === "bulk" ? (
              <BulkUpload
                profile={profile}
                onAddressSelect={(addr) => {
                  setMode("single");
                  setAddress(addr);
                  void handleRootSubmit(addr);
                }}
              />
            ) : (
              <>
                {activeData && <WhaleRadar data={activeData} profile={profile} />}
                {activeData && <MetricsBar data={activeData} />}
                {activeData && (
                  <TransactionList
                    transactions={activeData.incomingTx}
                    onAddressClick={(addr) => handleAddressClick(addr, activeData)}
                  />
                )}
              </>
            )}
          </>
        )}
      </div>

    </div>
  );
}

export default App;
