import { useEffect, useState } from "react";

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "";

type Candidate = {
  address: string;
  chain: string;
  source: string;
  confidence: number;
  status: string;
  tx_pattern_summary: string | null;
  customer_overlap_count: number;
};

type Stats = {
  total_active_contracts: number;
  added_this_week: number;
  pending_review_count: number;
  deprecated_this_week: number;
};

export default function AdminPanel() {
  const [items, setItems] = useState<Candidate[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(false);
  const [reviewer, setReviewer] = useState("admin");
  const [adminSecret, setAdminSecret] = useState(() => localStorage.getItem("sniffer_admin_secret") ?? "");
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    const res = await fetch(`${API_BASE}/api/admin/candidates?page=1&page_size=50`, {
      headers: { "x-admin-secret": adminSecret },
    });
    if (!res.ok) {
      setLoading(false);
      setError(`Failed to load candidates (${res.status})`);
      return;
    }
    const data = await res.json();
    setItems(data.items ?? []);
    setStats(data.stats ?? null);
    setLoading(false);
  }

  useEffect(() => {
    if (adminSecret) {
      localStorage.setItem("sniffer_admin_secret", adminSecret);
      void load();
    }
  }, [adminSecret]);

  async function review(address: string, chain: string, action: "approve" | "reject" | "needs_more") {
    const res = await fetch(`${API_BASE}/api/admin/review`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-admin-secret": adminSecret },
      body: JSON.stringify({ address, chain, action, reviewer }),
    });
    if (!res.ok) {
      setError(`Review request failed (${res.status})`);
      return;
    }
    await load();
  }

  return (
    <main className="app-admin-main ui-stack">
      <h1 className="ui-title-page">Admin Contract Review</h1>
      <div className="ui-admin-panel">
        <label className="ui-text-body" style={{ marginRight: "0.5em" }}>
          Reviewer:
        </label>
        <input
          value={reviewer}
          onChange={(e) => setReviewer(e.target.value)}
          className="ui-admin-input"
        />
      </div>
      <div className="ui-admin-panel">
        <label className="ui-text-body" style={{ marginRight: "0.5em" }}>
          Admin Secret:
        </label>
        <input
          value={adminSecret}
          onChange={(e) => setAdminSecret(e.target.value)}
          type="password"
          className="ui-admin-input"
        />
      </div>
      {error && (
        <div className="ui-banner-danger" style={{ borderColor: "rgba(239, 68, 68, 0.4)", color: "#fecaca" }}>
          {error}
        </div>
      )}

      {stats && (
        <section className="ui-admin-grid">
          <div className="ui-admin-stat">Active: {stats.total_active_contracts}</div>
          <div className="ui-admin-stat">Added week: {stats.added_this_week}</div>
          <div className="ui-admin-stat">Pending: {stats.pending_review_count}</div>
          <div className="ui-admin-stat">Deprecated week: {stats.deprecated_this_week}</div>
        </section>
      )}

      <button type="button" className="ui-btn ui-btn--primary" onClick={() => load()}>
        Refresh
      </button>

      <div className="ui-table-wrap">
        <table className="ui-table">
          <thead>
            <tr>
              <th>Address</th>
              <th>Chain</th>
              <th>Source</th>
              <th>Confidence</th>
              <th>Tx Pattern</th>
              <th>Overlap</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={8} style={{ padding: "0.75em 1em" }}>
                  Loading...
                </td>
              </tr>
            ) : (
              items.map((item) => (
                <tr key={`${item.chain}:${item.address}:${item.source}`}>
                  <td className="font-mono">
                    {item.address.slice(0, 8)}...{item.address.slice(-6)}
                  </td>
                  <td>{item.chain}</td>
                  <td>{item.source}</td>
                  <td>{item.confidence.toFixed(2)}</td>
                  <td>{item.tx_pattern_summary ?? "-"}</td>
                  <td>{item.customer_overlap_count}</td>
                  <td>{item.status}</td>
                  <td>
                    <div className="ui-btn-admin-row">
                      <button
                        type="button"
                        className="ui-btn-admin ui-btn-admin--emerald"
                        onClick={() => review(item.address, item.chain, "approve")}
                      >
                        Approve
                      </button>
                      <button
                        type="button"
                        className="ui-btn-admin ui-btn-admin--red"
                        onClick={() => review(item.address, item.chain, "reject")}
                      >
                        Reject
                      </button>
                      <button
                        type="button"
                        className="ui-btn-admin ui-btn-admin--amber"
                        onClick={() => review(item.address, item.chain, "needs_more")}
                      >
                        Needs More
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </main>
  );
}
