import hmac
import hashlib
import json
from contextlib import contextmanager

import pytest
from httpx import ASGITransport, AsyncClient

from app.main import app


TEST_WALLETS = [
    ("0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045", "ethereum"),
    ("0x742d35Cc6634C0532925a3b844Bc454e4438f44e", "ethereum"),
    ("0x66f820a414680b5bcda5eeca5dea238543f42054", "ethereum"),
    ("0x281055afc982d96fab65b3a49cac8b878184cb16", "ethereum"),
    ("0x53d284357ec70ce289d6d64134dfac8e511c8a3d", "ethereum"),
    ("TJDENsfBJs4RFETt1X1W8wMDc8M5XnJhd6", "tron"),
    ("TQx8P2V7kP7ZzA8LrQv6p9KR71fY9S6N4s", "tron"),
    ("TYoPNw4x8vvRb8yLgqzMiy9YFYQv9oKkqV", "tron"),
    ("5HcS2Qej4uPKop4pNaDHnVywxLvcw36M7w52Q7Yx5Q8g", "solana"),
    ("9xQeWvG816bUx9EPf9X4hABK9dQ6zJvWZ8ZVd6L5f6e", "solana"),
]


@pytest.fixture(autouse=True)
def patch_services(monkeypatch):
    import app.api.v1 as v1
    import app.api.admin as admin
    import app.services.notify as notify_mod

    async def fake_eth_snapshot(address, api_key):
        return {"balance": 100.0, "deposits": [{"hash": "0x1", "from": "0xabc", "to": address, "value_native": 20.0, "timestamp": 1700000000}], "price_usd": 3000.0}

    async def fake_tron_balance(address, key):
        return 500.0

    async def fake_tron_deposits(address, key, limit=200):
        return [{"hash": "t1", "from": "Tfrom", "to": address, "value_native": 120.0, "timestamp": 1700000000}]

    async def fake_sol_balance(address):
        return 300.0

    async def fake_sol_deposits(address):
        return [{"hash": "s1", "from": "Sfrom", "to": address, "value_native": 80.0, "timestamp": 1700000000}]

    async def fake_notify(payload):
        return {"route": "slack"}

    monkeypatch.setattr(v1, "eth_snapshot", fake_eth_snapshot)
    monkeypatch.setattr(v1, "tron_balance", fake_tron_balance)
    monkeypatch.setattr(v1, "tron_deposits", fake_tron_deposits)
    monkeypatch.setattr(v1, "sol_balance", fake_sol_balance)
    monkeypatch.setattr(v1, "sol_deposits", fake_sol_deposits)
    monkeypatch.setattr(v1, "_persist_scan_result", lambda *args, **kwargs: None)
    monkeypatch.setattr(notify_mod, "notify", fake_notify)

    class FakeCursor:
        def __init__(self):
            self._results = []
            self.rowcount = 1

        def execute(self, query, params=None):
            q = " ".join(query.lower().split())
            if "from contract_candidates" in q and "count(*)" not in q:
                self._results = [("0xabc", "ethereum", "seed", 0.6, "pending", "pattern", 12, "{}", None, None, None)]
            elif "count(*) from contract_candidates where status = 'pending'" in q:
                self._results = [(1,)]
            elif "count(*) from contract_candidates" in q:
                self._results = [(1,)]
            elif "count(*) from gambling_contracts where status = 'verified'" in q:
                self._results = [(7,)]
            elif "count(*) from gambling_contracts where created_at >=" in q:
                self._results = [(2,)]
            elif "status = 'deprecated'" in q:
                self._results = [(1,)]
            elif "from alerts_log" in q:
                self._results = [("0xabc", "ethereum", 88, "slack", "{}", None)]
            else:
                self._results = []
                self.rowcount = 1

        def fetchall(self):
            return self._results

        def fetchone(self):
            return self._results[0] if self._results else (0,)

        def __enter__(self):
            return self

        def __exit__(self, exc_type, exc, tb):
            return False

    class FakeConn:
        def cursor(self):
            return FakeCursor()

        def commit(self):
            return None

        def __enter__(self):
            return self

        def __exit__(self, exc_type, exc, tb):
            return False

    @contextmanager
    def fake_get_conn():
        yield FakeConn()

    monkeypatch.setattr(v1, "get_conn", fake_get_conn)
    monkeypatch.setattr(admin, "get_conn", fake_get_conn)
    monkeypatch.setenv("ETHERSCAN_API_KEY", "test")
    monkeypatch.setenv("TRONGRID_API_KEY", "test")
    monkeypatch.setenv("ADMIN_SHARED_SECRET", "admin-secret")
    monkeypatch.setenv("WEBHOOK_SHARED_SECRET", "webhook-secret")


@pytest.mark.asyncio
async def test_health_endpoint():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        res = await client.get("/health")
    assert res.status_code == 200


@pytest.mark.asyncio
async def test_lens_scores_endpoint():
    body = {
        "balance_eth": 100.0,
        "eth_price_usd": 3000.0,
        "unique_senders": 1,
        "incoming_tx": [
            {"from": "0xabc", "valueEth": 20.0, "timestamp": 1700000000},
        ],
    }
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        res = await client.post("/api/v1/lens-scores", json=body)
    assert res.status_code == 200
    data = res.json()
    assert len(data["profiles"]) == 5
    for p in data["profiles"]:
        assert 0 <= p["total"] <= 100


@pytest.mark.asyncio
@pytest.mark.parametrize("address,chain", TEST_WALLETS)
async def test_scan_endpoint_score_ranges(address, chain):
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        res = await client.post("/api/v1/scan", json={"address": address, "chain": chain})
    assert res.status_code == 200
    payload = res.json()
    assert 0 <= payload["score"]["total"] <= 100


@pytest.mark.asyncio
async def test_batch_endpoint():
    csv_data = "address,chain\n0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045,ethereum\nTJDENsfBJs4RFETt1X1W8wMDc8M5XnJhd6,tron\n"
    files = {"file": ("sample.csv", csv_data, "text/csv")}
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        res = await client.post("/api/v1/batch", files=files)
    assert res.status_code == 200
    assert res.json()["count"] == 2


@pytest.mark.asyncio
async def test_webhook_endpoint_with_hmac():
    body = {
        "event_id": "evt_1",
        "sender_wallet": "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045",
        "chain": "ethereum",
        "deposit_amount": 1.2,
    }
    raw = json.dumps(body).encode("utf-8")
    sig = "sha256=" + hmac.new(b"webhook-secret", raw, hashlib.sha256).hexdigest()
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        res = await client.post("/api/v1/webhook", content=raw, headers={"x-sniffer-signature": sig, "content-type": "application/json"})
    assert res.status_code == 200
    assert res.json()["webhook_status"] == "processed"


@pytest.mark.asyncio
async def test_alerts_recent_endpoint():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        res = await client.get("/api/v1/alerts/recent")
    assert res.status_code == 200
    assert "items" in res.json()


@pytest.mark.asyncio
async def test_admin_candidates_endpoint():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        res = await client.get("/api/admin/candidates?page=1&page_size=10", headers={"x-admin-secret": "admin-secret"})
    assert res.status_code == 200
    assert "stats" in res.json()


@pytest.mark.asyncio
async def test_admin_review_endpoint():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        res = await client.post(
            "/api/admin/review",
            json={"address": "0xabc", "chain": "ethereum", "action": "approve", "reviewer": "qa"},
            headers={"x-admin-secret": "admin-secret"},
        )
    assert res.status_code == 200
    assert res.json()["ok"] is True


@pytest.mark.asyncio
async def test_admin_jobs_run_endpoint():
    import app.api.admin as admin

    async def fake_job():
        return {"ok": True}

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        admin.self_learning_sweep = fake_job
        admin.etherscan_label_scrape = fake_job
        admin.verify_active_contracts = fake_job
        admin.arkham_sync = fake_job
        res = await client.post("/api/admin/jobs/run", headers={"x-admin-secret": "admin-secret"})
    assert res.status_code == 200


@pytest.mark.asyncio
async def test_whale_network_endpoints(monkeypatch):
    import app.api.v1 as v1

    class FakeJob:
        def __init__(self, job_id: str, status: str):
            self.job_id = job_id
            self.status = status

        def to_payload(self):
            return {
                "job_id": self.job_id,
                "root_address": "0xd8da6bf26964af9d7eed9e03e53415d37aa96045",
                "chain": "ethereum",
                "tx_window_days": 30,
                "telegram_notifications": False,
                "status": self.status,
                "progress": "ok",
                "processed_wallets": 1,
                "skipped_wallets": 0,
                "upstream_retries": 0,
                "queued_wallets": 0,
                "scanned_levels": 1,
                "whale_found": False,
                "whale_wallet": None,
                "whale_score": None,
                "whale_level": None,
                "error": None,
                "created_at": "2026-01-01T00:00:00Z",
                "updated_at": "2026-01-01T00:00:00Z",
                "completed_at": None,
            }

    async def fake_start(address: str, chain: str, **kwargs: object):
        return FakeJob("job_123", "running")

    async def fake_get(job_id: str):
        return FakeJob(job_id, "running")

    async def fake_cancel(job_id: str):
        return FakeJob(job_id, "cancelled")

    monkeypatch.setattr(v1, "start_whale_network_job", fake_start)
    monkeypatch.setattr(v1, "get_whale_network_job", fake_get)
    monkeypatch.setattr(v1, "cancel_whale_network_job", fake_cancel)

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        start_res = await client.post(
            "/api/v1/whale-network/start",
            json={"address": "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045", "chain": "ethereum"},
        )
        assert start_res.status_code == 200
        job_id = start_res.json()["job_id"]

        status_res = await client.get(f"/api/v1/whale-network/{job_id}")
        assert status_res.status_code == 200
        assert status_res.json()["status"] == "running"

        cancel_res = await client.post(f"/api/v1/whale-network/{job_id}/cancel")
        assert cancel_res.status_code == 200
        assert cancel_res.json()["status"] == "cancelled"
