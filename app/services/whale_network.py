from __future__ import annotations

import asyncio
import logging
import os
import re
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Dict, Literal

from app.services.ethereum import eth_snapshot
from app.services.http_client import UpstreamHTTPError, get_json_with_retry
from app.services.notify import send_telegram_text
from app.services.scorer import score
from app.services.solana import sol_balance, sol_deposits
from app.services.tron import tron_balance, tron_deposits

logger = logging.getLogger(__name__)

ETHERSCAN_BASE = "https://api.etherscan.io/v2/api"
ETH_ADDRESS_RE = re.compile(r"^0x[a-fA-F0-9]{40}$")
MAX_LEVEL = 4
MAX_WALLETS_TOTAL = 250
MAX_NEIGHBORS_PER_WALLET = 30
WHALE_SCORE_THRESHOLD = 70
_TELEGRAM_PROGRESS_EVERY = 5
# Parallel wallets per BFS level (bounded to protect upstream APIs).
_ETH_CONCURRENCY_DEFAULT = 4
_TRON_CONCURRENCY_DEFAULT = 6
_SOL_CONCURRENCY_DEFAULT = 4
# Max asyncio tasks per gather chunk (frontiers can be large at deep levels).
_FRONTIER_CHUNK_SIZE = 48


def _parallel_concurrency(chain: str) -> int:
    c = chain.lower()
    if c == "ethereum":
        raw = os.getenv("WHALE_NETWORK_ETH_CONCURRENCY", str(_ETH_CONCURRENCY_DEFAULT)).strip()
    elif c == "tron":
        raw = os.getenv("WHALE_NETWORK_TRON_CONCURRENCY", str(_TRON_CONCURRENCY_DEFAULT)).strip()
    elif c == "solana":
        raw = os.getenv("WHALE_NETWORK_SOL_CONCURRENCY", str(_SOL_CONCURRENCY_DEFAULT)).strip()
    else:
        return 2
    try:
        n = int(raw)
    except ValueError:
        n = _ETH_CONCURRENCY_DEFAULT
    return max(1, min(16, n))


def _iso_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _neighbor_cutoff_timestamp(tx_window_days: int | None) -> int | None:
    """None = full history (no time cutoff)."""
    if tx_window_days is None:
        return None
    now = int(datetime.now(timezone.utc).timestamp())
    return now - int(tx_window_days) * 24 * 60 * 60


def _window_label(tx_window_days: int | None) -> str:
    if tx_window_days is None:
        return "full"
    return f"{tx_window_days}d"


def _visit_key(chain: str, addr: str) -> str:
    """Key for de-duplication (Ethereum is case-insensitive)."""
    if chain == "ethereum":
        return addr.strip().lower()
    return addr.strip()


@dataclass
class WhaleNetworkJob:
    job_id: str
    root_address: str
    chain: str
    tx_window_days: int | None = 30
    telegram_chat_id: str | None = None
    status: Literal["queued", "running", "completed", "failed", "cancelled"] = "queued"
    progress: str = "queued"
    processed_wallets: int = 0
    skipped_wallets: int = 0
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
            "tx_window_days": self.tx_window_days,
            "telegram_notifications": bool(self.telegram_chat_id and self.telegram_chat_id.strip()),
            "status": self.status,
            "progress": self.progress,
            "processed_wallets": self.processed_wallets,
            "skipped_wallets": self.skipped_wallets,
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


def _eth_neighbors(address: str, txs: list[dict[str, Any]], *, cutoff_ts: int | None) -> list[str]:
    """Neighbors from counterparty addresses in recent txs (desc by time)."""
    addr = address.lower()
    out: list[str] = []
    seen: set[str] = set()
    for tx in txs:
        try:
            ts = int(tx.get("timeStamp", 0) or 0)
        except (TypeError, ValueError):
            continue
        if cutoff_ts is not None and ts < cutoff_ts:
            break
        frm = str(tx.get("from", "")).lower()
        to = str(tx.get("to", "")).lower()
        if frm == addr and ETH_ADDRESS_RE.match(to):
            if to not in seen:
                seen.add(to)
                out.append(to)
        elif to == addr and ETH_ADDRESS_RE.match(frm):
            if frm not in seen:
                seen.add(frm)
                out.append(frm)
        if len(out) >= MAX_NEIGHBORS_PER_WALLET:
            break
    return out


def _tron_neighbors_from_deposits(deposits: list[Dict[str, Any]], *, cutoff_ts: int | None) -> list[str]:
    out: list[str] = []
    seen: set[str] = set()
    for row in deposits:
        ts = int(row.get("timestamp", 0) or 0)
        if cutoff_ts is not None and ts < cutoff_ts:
            break
        frm = str(row.get("from", "") or "")
        if frm and frm not in seen:
            seen.add(frm)
            out.append(frm)
        if len(out) >= MAX_NEIGHBORS_PER_WALLET:
            break
    return out


def _sol_neighbors_from_deposits(deposits: list[Dict[str, Any]], *, cutoff_ts: int | None) -> list[str]:
    out: list[str] = []
    seen: set[str] = set()
    for row in deposits:
        ts = int(row.get("timestamp", 0) or 0)
        if cutoff_ts is not None and ts < cutoff_ts:
            break
        frm = str(row.get("from", "") or "")
        if frm and frm != "unknown" and frm not in seen:
            seen.add(frm)
            out.append(frm)
        if len(out) >= MAX_NEIGHBORS_PER_WALLET:
            break
    return out


async def _wallet_snapshot_and_score(
    address: str,
    chain: str,
    *,
    tx_window_days: int | None,
) -> tuple[int, list[str]]:
    cutoff_ts = _neighbor_cutoff_timestamp(tx_window_days)
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
        neighbors = _eth_neighbors(address, txs, cutoff_ts=cutoff_ts)
        return int(scoring.get("total", 0)), neighbors

    if chain == "tron":
        tron_key = os.getenv("TRONGRID_API_KEY", "").strip() or None
        if not tron_key:
            raise RuntimeError("Missing TRONGRID_API_KEY")
        bal = await tron_balance(address, tron_key)
        deposits = await tron_deposits(address, tron_key)
        normalized = _normalize_for_score(deposits)
        scoring = score(address, txlist=normalized, balance_eth=bal, eth_price_usd=0)
        neighbors = _tron_neighbors_from_deposits(deposits, cutoff_ts=cutoff_ts)
        return int(scoring.get("total", 0)), neighbors

    if chain == "solana":
        bal = await sol_balance(address)
        deposits = await sol_deposits(address)
        deposits.sort(key=lambda r: int(r.get("timestamp", 0) or 0), reverse=True)
        normalized = _normalize_for_score(deposits)
        scoring = score(address, txlist=normalized, balance_eth=bal, eth_price_usd=0)
        neighbors = _sol_neighbors_from_deposits(deposits, cutoff_ts=cutoff_ts)
        return int(scoring.get("total", 0)), neighbors

    raise RuntimeError(f"Unsupported chain: {chain}")


async def _telegram_safe(job: WhaleNetworkJob, text: str) -> None:
    cid = (job.telegram_chat_id or "").strip()
    if not cid:
        return
    try:
        await send_telegram_text(text, chat_id=cid)
    except Exception:  # noqa: BLE001
        logger.exception("Whale network Telegram send failed")


async def _run_job(job_id: str) -> None:
    async with _JOBS_LOCK:
        job = _JOBS.get(job_id)
    if not job:
        return

    try:
        job.status = "running"
        job.progress = f"Breadth scan (max {MAX_LEVEL} levels), window {_window_label(job.tx_window_days)}…"
        job.updated_at = _iso_now()

        await _telegram_safe(
            job,
            "🔎 Whale network scan started\n"
            f"Root: `{job.root_address}`\n"
            f"Chain: {job.chain}\n"
            f"Tx window: {_window_label(job.tx_window_days)}\n"
            f"Job: `{job.job_id}`",
        )

        root_raw = job.root_address.strip()
        root_key = _visit_key(job.chain, root_raw)
        visited: set[str] = {root_key}
        level = 0
        frontier: list[str] = [root_raw]
        conc = _parallel_concurrency(job.chain)
        sem = asyncio.Semaphore(conc)

        async def scan_wallet(wallet: str) -> tuple[str, int | None, list[str] | None, Exception | None]:
            async with sem:
                try:
                    score, neighbors = await _wallet_snapshot_and_score(
                        wallet,
                        job.chain,
                        tx_window_days=job.tx_window_days,
                    )
                    return (wallet, score, neighbors, None)
                except asyncio.CancelledError:
                    raise
                except Exception as exc:  # noqa: BLE001
                    return (wallet, None, None, exc)

        whale_hit: tuple[str, int, int] | None = None

        while frontier and len(visited) <= MAX_WALLETS_TOTAL:
            if job.cancel_requested:
                job.status = "cancelled"
                job.progress = "Cancelled"
                job.updated_at = _iso_now()
                job.completed_at = _iso_now()
                await _telegram_safe(
                    job,
                    f"⏹ Whale scan cancelled\n"
                    f"Processed {job.processed_wallets}, skipped {job.skipped_wallets}",
                )
                return

            if level >= MAX_LEVEL:
                break

            job.scanned_levels = max(job.scanned_levels, level)
            job.progress = (
                f"Level {level + 1}/{MAX_LEVEL}: batch {len(frontier)} wallet(s), "
                f"up to {conc} concurrent upstream calls…"
            )
            job.updated_at = _iso_now()

            next_frontier: list[str] = []
            stop_all = False

            for chunk_start in range(0, len(frontier), _FRONTIER_CHUNK_SIZE):
                if job.cancel_requested or stop_all:
                    break
                chunk = frontier[chunk_start : chunk_start + _FRONTIER_CHUNK_SIZE]
                chunk_results = await asyncio.gather(*(scan_wallet(w) for w in chunk))

                for raw in chunk_results:
                    wallet, total_score, neighbors, err = raw
                    if err is not None:
                        job.skipped_wallets += 1
                        job.progress = (
                            f"Skipped wallet after upstream error ({job.skipped_wallets} skips); continuing…"
                        )
                        job.updated_at = _iso_now()
                        logger.warning("Whale network skip wallet=%s error=%s", wallet, err)
                        continue

                    assert total_score is not None and neighbors is not None
                    job.processed_wallets += 1

                    if (
                        job.telegram_chat_id
                        and job.processed_wallets % _TELEGRAM_PROGRESS_EVERY == 0
                        and whale_hit is None
                    ):
                        await _telegram_safe(
                            job,
                            "⏳ Whale scan progress\n"
                            f"Processed: {job.processed_wallets}\n"
                            f"Skipped: {job.skipped_wallets}\n"
                            f"Queued (next wave): {len(next_frontier)}\n"
                            f"Depth: {min(MAX_LEVEL, level + 1)}/{MAX_LEVEL}",
                        )

                    if _visit_key(job.chain, wallet) != root_key and total_score >= WHALE_SCORE_THRESHOLD:
                        whale_hit = (wallet, total_score, level)
                        stop_all = True
                        break

                    if level + 1 < MAX_LEVEL:
                        for nxt in neighbors[:MAX_NEIGHBORS_PER_WALLET]:
                            if len(visited) >= MAX_WALLETS_TOTAL:
                                stop_all = True
                                break
                            nk = _visit_key(job.chain, nxt)
                            if nk in visited:
                                continue
                            visited.add(nk)
                            next_frontier.append(nxt)
                        if stop_all:
                            break

                if stop_all:
                    break

            job.queued_wallets = len(next_frontier)
            job.updated_at = _iso_now()

            if whale_hit:
                w, sc, lev = whale_hit
                job.whale_found = True
                job.whale_wallet = w
                job.whale_score = sc
                job.whale_level = lev
                job.status = "completed"
                job.progress = "Whale network detected"
                job.updated_at = _iso_now()
                job.completed_at = _iso_now()
                await _telegram_safe(
                    job,
                    "🐋 Whale network hit\n"
                    f"Wallet: `{job.whale_wallet}`\n"
                    f"Score: {job.whale_score} (threshold {WHALE_SCORE_THRESHOLD})\n"
                    f"Graph level: {job.whale_level}\n"
                    f"Processed: {job.processed_wallets}, skipped: {job.skipped_wallets}",
                )
                return

            frontier = next_frontier
            level += 1

        if job.cancel_requested:
            job.status = "cancelled"
            job.progress = "Cancelled"
            job.updated_at = _iso_now()
            job.completed_at = _iso_now()
            await _telegram_safe(
                job,
                f"⏹ Whale scan cancelled\n"
                f"Processed {job.processed_wallets}, skipped {job.skipped_wallets}",
            )
            return

        job.status = "completed"
        job.progress = "Completed"
        job.updated_at = _iso_now()
        job.completed_at = _iso_now()
        await _telegram_safe(
            job,
            "✅ Whale scan completed\n"
            f"Whale found: {job.whale_found}\n"
            f"Processed: {job.processed_wallets}, skipped: {job.skipped_wallets}\n"
            f"Max depth reached: {min(MAX_LEVEL, job.scanned_levels + 1)}/{MAX_LEVEL}",
        )
    except asyncio.CancelledError:
        job.status = "cancelled"
        job.progress = "Cancelled"
        job.updated_at = _iso_now()
        job.completed_at = _iso_now()
        await _telegram_safe(job, "⏹ Whale scan cancelled (task stopped)")
    except Exception as exc:  # noqa: BLE001
        job.status = "failed"
        job.error = str(exc)
        job.progress = "Failed"
        job.updated_at = _iso_now()
        job.completed_at = _iso_now()
        await _telegram_safe(job, f"❌ Whale scan failed\n{str(exc)[:3500]}")


async def start_whale_network_job(
    address: str,
    chain: str,
    *,
    tx_window_days: int | None = 30,
    telegram_chat_id: str | None = None,
) -> WhaleNetworkJob:
    job_id = uuid.uuid4().hex
    tg = (telegram_chat_id or "").strip() or None
    job = WhaleNetworkJob(
        job_id=job_id,
        root_address=address.strip(),
        chain=chain.strip().lower(),
        tx_window_days=tx_window_days,
        telegram_chat_id=tg,
    )
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
