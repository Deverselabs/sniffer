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
    <main className="mx-auto max-w-6xl space-y-4 p-6 text-white">
      <h1 className="text-2xl font-bold">Admin Contract Review</h1>
      <div className="rounded-lg border border-[rgba(127,119,221,0.25)] bg-[rgba(127,119,221,0.08)] p-3">
        <label className="mr-2 text-sm">Reviewer:</label>
        <input
          value={reviewer}
          onChange={(e) => setReviewer(e.target.value)}
          className="rounded bg-[rgba(255,255,255,0.08)] px-2 py-1 text-sm"
        />
      </div>
      <div className="rounded-lg border border-[rgba(127,119,221,0.25)] bg-[rgba(127,119,221,0.08)] p-3">
        <label className="mr-2 text-sm">Admin Secret:</label>
        <input
          value={adminSecret}
          onChange={(e) => setAdminSecret(e.target.value)}
          type="password"
          className="rounded bg-[rgba(255,255,255,0.08)] px-2 py-1 text-sm"
        />
      </div>
      {error && <div className="rounded border border-red-500/40 bg-red-500/10 p-2 text-sm text-red-200">{error}</div>}

      {stats && (
        <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <div className="rounded border border-[rgba(255,255,255,0.15)] p-3">Active: {stats.total_active_contracts}</div>
          <div className="rounded border border-[rgba(255,255,255,0.15)] p-3">Added week: {stats.added_this_week}</div>
          <div className="rounded border border-[rgba(255,255,255,0.15)] p-3">Pending: {stats.pending_review_count}</div>
          <div className="rounded border border-[rgba(255,255,255,0.15)] p-3">Deprecated week: {stats.deprecated_this_week}</div>
        </section>
      )}

      <button
        onClick={() => load()}
        className="rounded bg-indigo-600 px-3 py-2 text-sm font-medium hover:bg-indigo-500"
      >
        Refresh
      </button>

      <div className="overflow-x-auto rounded-lg border border-[rgba(127,119,221,0.25)]">
        <table className="min-w-full text-sm">
          <thead className="bg-[rgba(255,255,255,0.05)]">
            <tr>
              <th className="px-2 py-2 text-left">Address</th>
              <th className="px-2 py-2 text-left">Chain</th>
              <th className="px-2 py-2 text-left">Source</th>
              <th className="px-2 py-2 text-left">Confidence</th>
              <th className="px-2 py-2 text-left">Tx Pattern</th>
              <th className="px-2 py-2 text-left">Overlap</th>
              <th className="px-2 py-2 text-left">Status</th>
              <th className="px-2 py-2 text-left">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td className="px-2 py-3" colSpan={8}>Loading...</td></tr>
            ) : (
              items.map((item) => (
                <tr key={`${item.chain}:${item.address}:${item.source}`} className="border-t border-[rgba(255,255,255,0.08)]">
                  <td className="px-2 py-2 font-mono">{item.address.slice(0, 8)}...{item.address.slice(-6)}</td>
                  <td className="px-2 py-2">{item.chain}</td>
                  <td className="px-2 py-2">{item.source}</td>
                  <td className="px-2 py-2">{item.confidence.toFixed(2)}</td>
                  <td className="px-2 py-2">{item.tx_pattern_summary ?? "-"}</td>
                  <td className="px-2 py-2">{item.customer_overlap_count}</td>
                  <td className="px-2 py-2">{item.status}</td>
                  <td className="px-2 py-2 space-x-1">
                    <button className="rounded bg-emerald-600 px-2 py-1" onClick={() => review(item.address, item.chain, "approve")}>Approve</button>
                    <button className="rounded bg-red-600 px-2 py-1" onClick={() => review(item.address, item.chain, "reject")}>Reject</button>
                    <button className="rounded bg-amber-600 px-2 py-1" onClick={() => review(item.address, item.chain, "needs_more")}>Needs More</button>
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
