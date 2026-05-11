from __future__ import annotations

import asyncio
import os
import re
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Dict, Literal

from app.services.ethereum import eth_snapshot
from app.services.http_client import UpstreamHTTPError, get_json_with_retry
from app.services.scorer import score
from app.services.solana import sol_balance, sol_deposits
from app.services.tron import tron_balance, tron_deposits

ETHERSCAN_BASE = "https://api.etherscan.io/v2/api"
ETH_ADDRESS_RE = re.compile(r"^0x[a-fA-F0-9]{40}$")
MAX_LEVEL = 4
MAX_WALLETS_TOTAL = 250
MAX_NEIGHBORS_PER_WALLET = 30
WHALE_SCORE_THRESHOLD = 70


def _iso_now() -> str:
    return datetime.now(timezone.utc).isoformat()


@dataclass
class WhaleNetworkJob:
    job_id: str
    root_address: str
    chain: str
    status: Literal["queued", "running", "completed", "failed", "cancelled"] = "queued"
    progress: str = "queued"
    processed_wallets: int = 0
    queued_wallets: int = 0
    scanned_levels: int = 0
    whale_found: bool = False
    whale_wallet: str | None = None
    whale_score: int | None = None
    whale_level: int | None = None
    error: str | None = None
    created_at: str = field(default_factory=_iso_now)
    updated_at: str = field(default_factory=_iso_now)
    completed_at: str | None = None
    cancel_requested: bool = False
    task: asyncio.Task[None] | None = None

    def to_payload(self) -> Dict[str, Any]:
        return {
            "job_id": self.job_id,
            "root_address": self.root_address,
            "chain": self.chain,
            "status": self.status,
            "progress": self.progress,
            "processed_wallets": self.processed_wallets,
            "queued_wallets": self.queued_wallets,
            "scanned_levels": self.scanned_levels,
            "whale_found": self.whale_found,
            "whale_wallet": self.whale_wallet,
            "whale_score": self.whale_score,
            "whale_level": self.whale_level,
            "error": self.error,
            "created_at": self.created_at,
            "updated_at": self.updated_at,
            "completed_at": self.completed_at,
        }


_JOBS: dict[str, WhaleNetworkJob] = {}
_JOBS_LOCK = asyncio.Lock()


def _normalize_for_score(deposits: list[Dict[str, Any]]) -> list[Dict[str, Any]]:
    normalized: list[Dict[str, Any]] = []
    for row in deposits:
        normalized.append(
            {
                "from": row["from"],
                "to": row["to"],
                "value": str(int(float(row["value_native"]) * 1e18)),
                "timeStamp": str(int(row["timestamp"])),
            }
        )
    return normalized


async def _etherscan_txlist(address: str, api_key: str) -> list[dict[str, Any]]:
    try:
        body = await get_json_with_retry(
            ETHERSCAN_BASE,
            params={
                "module": "account",
                "action": "txlist",
                "chainid": 1,
                "address": address,
                "startblock": 0,
                "endblock": 99999999,
                "sort": "desc",
                "apikey": api_key,
            },
            timeout=30,
        )
    except UpstreamHTTPError:
        return []
    result = body.get("result", [])
    return result if isinstance(result, list) else []


def _eth_neighbors_last_30d(address: str, txs: list[dict[str, Any]]) -> list[str]:
    now = int(datetime.now(timezone.utc).timestamp())
    cutoff = now - 30 * 24 * 60 * 60
    addr = address.lower()
    out: set[str] = set()
    for tx in txs:
        try:
            ts = int(tx.get("timeStamp", 0) or 0)
        except (TypeError, ValueError):
            continue
        if ts < cutoff:
            continue
        frm = str(tx.get("from", "")).lower()
        to = str(tx.get("to", "")).lower()
        if frm == addr and ETH_ADDRESS_RE.match(to):
            out.add(to)
        elif to == addr and ETH_ADDRESS_RE.match(frm):
            out.add(frm)
        if len(out) >= MAX_NEIGHBORS_PER_WALLET:
            break
    return list(out)


async def _wallet_snapshot_and_score(address: str, chain: str) -> tuple[int, list[str]]:
    chain = chain.lower()
    if chain == "ethereum":
        api_key = os.getenv("ETHERSCAN_API_KEY", "").strip()
        if not api_key:
            raise RuntimeError("Missing ETHERSCAN_API_KEY")
        snapshot = await eth_snapshot(address, api_key)
        normalized = _normalize_for_score(snapshot["deposits"])
        scoring = score(
            address,
            txlist=normalized,
            balance_eth=float(snapshot["balance"]),
            eth_price_usd=float(snapshot.get("price_usd", 0) or 0),
        )
        txs = await _etherscan_txlist(address, api_key)
        neighbors = _eth_neighbors_last_30d(address, txs)
        return int(scoring.get("total", 0)), neighbors

    if chain == "tron":
        tron_key = os.getenv("TRONGRID_API_KEY", "").strip() or None
        if not tron_key:
            raise RuntimeError("Missing TRONGRID_API_KEY")
        bal = await tron_balance(address, tron_key)
        deposits = await tron_deposits(address, tron_key)
        normalized = _normalize_for_score(deposits)
        scoring = score(address, txlist=normalized, balance_eth=bal, eth_price_usd=0)
        neighbors = list(
            {
                str(row.get("from", "")).lower()
                for row in deposits
                if row.get("from")
            }
        )[:MAX_NEIGHBORS_PER_WALLET]
        return int(scoring.get("total", 0)), neighbors

    if chain == "solana":
        bal = await sol_balance(address)
        deposits = await sol_deposits(address)
        normalized = _normalize_for_score(deposits)
        scoring = score(address, txlist=normalized, balance_eth=bal, eth_price_usd=0)
        neighbors = list(
            {
                str(row.get("from", "")).lower()
                for row in deposits
                if row.get("from")
            }
        )[:MAX_NEIGHBORS_PER_WALLET]
        return int(scoring.get("total", 0)), neighbors

    raise RuntimeError(f"Unsupported chain: {chain}")


async def _run_job(job_id: str) -> None:
    async with _JOBS_LOCK:
        job = _JOBS.get(job_id)
    if not job:
        return

    try:
        job.status = "running"
        job.progress = "Starting breadth scan (max 4 levels)…"
        job.updated_at = _iso_now()

        queue: list[tuple[str, int]] = [(job.root_address.lower(), 0)]
        visited: set[str] = {job.root_address.lower()}

        while queue and len(visited) <= MAX_WALLETS_TOTAL:
            if job.cancel_requested:
                job.status = "cancelled"
                job.progress = "Cancelled"
                job.updated_at = _iso_now()
                job.completed_at = _iso_now()
                return

            wallet, level = queue.pop(0)
            job.scanned_levels = max(job.scanned_levels, level)
            job.progress = f"Scanning level {level + 1}/{MAX_LEVEL} wallets…"
            job.updated_at = _iso_now()

            total_score, neighbors = await _wallet_snapshot_and_score(wallet, job.chain)
            job.processed_wallets += 1

            if wallet != job.root_address.lower() and total_score >= WHALE_SCORE_THRESHOLD:
                job.whale_found = True
                job.whale_wallet = wallet
                job.whale_score = total_score
                job.whale_level = level
                job.status = "completed"
                job.progress = "Whale network detected"
                job.updated_at = _iso_now()
                job.completed_at = _iso_now()
                return

            if level + 1 >= MAX_LEVEL:
                continue

            for nxt in neighbors[:MAX_NEIGHBORS_PER_WALLET]:
                if nxt in visited:
                    continue
                visited.add(nxt)
                queue.append((nxt, level + 1))

            job.queued_wallets = len(queue)
            job.updated_at = _iso_now()

        job.status = "completed"
        job.progress = "Completed"
        job.updated_at = _iso_now()
        job.completed_at = _iso_now()
    except asyncio.CancelledError:
        job.status = "cancelled"
        job.progress = "Cancelled"
        job.updated_at = _iso_now()
        job.completed_at = _iso_now()
    except Exception as exc:  # noqa: BLE001
        job.status = "failed"
        job.error = str(exc)
        job.progress = "Failed"
        job.updated_at = _iso_now()
        job.completed_at = _iso_now()


async def start_whale_network_job(address: str, chain: str) -> WhaleNetworkJob:
    job_id = uuid.uuid4().hex
    job = WhaleNetworkJob(job_id=job_id, root_address=address.strip(), chain=chain.strip().lower())
    async with _JOBS_LOCK:
        _JOBS[job_id] = job
    task = asyncio.create_task(_run_job(job_id))
    job.task = task
    return job


async def get_whale_network_job(job_id: str) -> WhaleNetworkJob | None:
    async with _JOBS_LOCK:
        return _JOBS.get(job_id)


async def cancel_whale_network_job(job_id: str) -> WhaleNetworkJob | None:
    async with _JOBS_LOCK:
        job = _JOBS.get(job_id)
    if not job:
        return None
    job.cancel_requested = True
    if job.task and not job.task.done():
        job.task.cancel()
    return job

