from __future__ import annotations

import csv
import io
import os
import asyncio
import json
import hmac
import hashlib
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Literal

from fastapi import APIRouter, BackgroundTasks, File, HTTPException, Request, UploadFile
from pydantic import BaseModel, Field, field_validator

from app.db import get_conn
from app.services.notify import notify
from app.services.ethereum import eth_snapshot
from app.services.lens_scoring import compute_all_lens_scores
from app.services.scorer import score
from app.services.whale_network import (
    cancel_whale_network_job,
    get_whale_network_job,
    start_whale_network_job,
)
from app.services.solana import sol_balance, sol_deposits
from app.services.tron import tron_balance, tron_deposits
from app.utils.validators import validate_address

router = APIRouter(prefix="/api/v1", tags=["scan"])
SUPPORTED_CHAINS = {"ethereum", "tron", "solana"}


class ScanRequest(BaseModel):
    """Request payload for scanning one wallet."""

    address: str = Field(..., min_length=2)
    chain: Literal["ethereum", "tron", "solana"] = "ethereum"


class LensScoresRequest(BaseModel):
    """Wallet snapshot fields used to score all industry lenses (matches frontend whale score)."""

    balance_eth: float = 0.0
    eth_price_usd: float | None = None
    unique_senders: int = 0
    incoming_tx: List[Dict[str, Any]] = Field(default_factory=list)


class WhaleNetworkStartRequest(BaseModel):
    address: str = Field(..., min_length=2)
    chain: Literal["ethereum", "tron", "solana"] = "ethereum"
    tx_window_days: int | None = Field(
        default=30,
        description="Neighbor discovery window in days; null = full history (per-wallet caps still apply).",
    )
    max_levels: int | None = Field(
        default=None,
        ge=1,
        le=5,
        description=(
            "BFS graph depth (root = level 0). 1–5. Omit to use server default WHALE_NETWORK_MAX_LEVEL."
        ),
    )
    telegram_chat_id: str = Field(
        ...,
        min_length=1,
        max_length=80,
        description="Telegram chat or channel id for whale map progress and results.",
    )

    @field_validator("tx_window_days")
    @classmethod
    def validate_tx_window(cls, v: int | None) -> int | None:
        if v is None:
            return None
        if v < 1 or v > 3650:
            raise ValueError("tx_window_days must be null or between 1 and 3650")
        return v

    @field_validator("telegram_chat_id", mode="before")
    @classmethod
    def normalize_telegram(cls, v: object) -> str:
        if v is None:
            raise ValueError("telegram_chat_id is required")
        s = str(v).strip()
        if not s:
            raise ValueError("telegram_chat_id is required")
        return s


class WebhookRequest(BaseModel):
    """Inbound webhook payload from casino/exchange deposit systems."""

    event_id: str
    sender_wallet: str
    chain: Literal["ethereum", "tron", "solana"] = "ethereum"
    deposit_amount: float = Field(default=0, ge=0)
    tx_hash: str | None = None


def _incoming_tx_for_lens_scores(rows: list[Dict[str, Any]]) -> list[Dict[str, Any]]:
    """Normalize client deposit rows to lens_scoring input (from, value_eth, timestamp)."""
    out: list[Dict[str, Any]] = []
    for tx in rows:
        from_addr = str(tx.get("from", "")).lower()
        ve = tx.get("valueEth")
        if ve is None:
            ve = tx.get("value_eth")
        if ve is None:
            ve = tx.get("value_native", 0)
        out.append(
            {
                "from": from_addr,
                "value_eth": float(ve or 0),
                "timestamp": int(tx.get("timestamp", 0)),
            }
        )
    return out


def _normalize_for_score(address: str, deposits: list[Dict[str, Any]]) -> list[Dict[str, Any]]:
    normalized: list[Dict[str, Any]] = []
    for row in deposits:
        normalized.append(
            {
                "from": row["from"],
                "to": row["to"],
                "value": str(int(float(row["value_native"]) * 1e18)),
                "timeStamp": str(row["timestamp"]),
            }
        )
    return normalized


@router.post(
    "/scan",
    summary="Scan wallet score",
    description="Scan a wallet address on ethereum/tron/solana and return score + deposits.",
)
async def scan_wallet(body: ScanRequest, background_tasks: BackgroundTasks) -> Dict[str, Any]:
    address = body.address.strip()
    chain = body.chain
    if not validate_address(chain, address):
        raise HTTPException(status_code=400, detail=f"Invalid {chain} address format")

    try:
        if chain == "ethereum":
            api_key = os.getenv("ETHERSCAN_API_KEY", "").strip()
            if not api_key:
                raise HTTPException(status_code=500, detail="Missing ETHERSCAN_API_KEY")
            snapshot = await eth_snapshot(address, api_key)
            normalized = _normalize_for_score(address, snapshot["deposits"])
            scoring = score(
                address,
                txlist=normalized,
                balance_eth=snapshot["balance"],
                eth_price_usd=snapshot["price_usd"],
            )
        elif chain == "tron":
            tron_key = os.getenv("TRONGRID_API_KEY", "").strip() or None
            if not tron_key:
                raise HTTPException(status_code=500, detail="Missing TRONGRID_API_KEY")
            balance = await tron_balance(address, tron_key)
            deposits = await tron_deposits(address, tron_key)
            normalized = _normalize_for_score(address, deposits)
            scoring = score(address, txlist=normalized, balance_eth=balance, eth_price_usd=0)
            snapshot = {"balance": balance, "deposits": deposits}
        else:
            balance = await sol_balance(address)
            deposits = await sol_deposits(address)
            normalized = _normalize_for_score(address, deposits)
            scoring = score(address, txlist=normalized, balance_eth=balance, eth_price_usd=0)
            snapshot = {"balance": balance, "deposits": deposits}
    except HTTPException:
        raise
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=502, detail=f"{chain} scan failed: {exc}") from exc

    eth_price_usd = float(snapshot.get("price_usd", 0) or 0) if chain == "ethereum" else 0.0
    response_payload = {
        "address": address,
        "chain": chain,
        "balance": snapshot["balance"],
        "deposits": snapshot["deposits"],
        "eth_price_usd": eth_price_usd,
        "score": scoring,
    }
    _persist_scan_result(address, chain, scoring, response_payload)
    if int(scoring.get("total", 0)) >= 50:
        background_tasks.add_task(
            notify,
            {
                "address": address,
                "chain": chain,
                "score": int(scoring.get("total", 0)),
                "tier": scoring.get("tier"),
                "source": "scan",
            },
        )
    return response_payload


@router.post(
    "/lens-scores",
    summary="All industry lens scores",
    description=(
        "Compute Whale Radar totals for every scoring lens from a wallet snapshot. "
        "Runs off the event loop; intended to be called after /scan once deposits are loaded."
    ),
)
async def lens_scores(body: LensScoresRequest) -> Dict[str, Any]:
    txs = _incoming_tx_for_lens_scores(body.incoming_tx)
    price = float(body.eth_price_usd or 0)

    def work() -> list[Dict[str, Any]]:
        return compute_all_lens_scores(
            balance_eth=body.balance_eth,
            eth_price_usd=price,
            unique_senders=body.unique_senders,
            incoming_tx=txs,
        )

    profiles = await asyncio.to_thread(work)
    return {"profiles": profiles}


@router.post(
    "/whale-network/start",
    summary="Start whale network scan job",
    description=(
        "Start background BFS scan up to max_levels (1–5) or server default. Neighbors come from "
        "counterparties in recent transactions (tx_window_days, or full history when null). "
        "telegram_chat_id is required for notifications and scan coordination."
    ),
)
async def whale_network_start(body: WhaleNetworkStartRequest) -> Dict[str, Any]:
    address = body.address.strip()
    chain = body.chain
    if not validate_address(chain, address):
        raise HTTPException(status_code=400, detail=f"Invalid {chain} address format")
    job = await start_whale_network_job(
        address,
        chain,
        tx_window_days=body.tx_window_days,
        telegram_chat_id=body.telegram_chat_id,
        max_levels=body.max_levels,
    )
    return job.to_payload()


@router.get(
    "/whale-network/{job_id}",
    summary="Get whale network scan job status",
)
async def whale_network_status(job_id: str) -> Dict[str, Any]:
    job = await get_whale_network_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="whale network job not found")
    return job.to_payload()


@router.post(
    "/whale-network/{job_id}/cancel",
    summary="Cancel whale network scan job",
)
async def whale_network_cancel(job_id: str) -> Dict[str, Any]:
    job = await cancel_whale_network_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="whale network job not found")
    return job.to_payload()


def _persist_scan_result(address: str, chain: str, scoring: dict[str, Any], payload: dict[str, Any]) -> None:
    try:
        with get_conn() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    INSERT INTO wallet_scores (wallet_address, chain, total_score, tier_breakdown, metadata)
                    VALUES (%s, %s, %s, %s::jsonb, %s::jsonb)
                    """,
                    (
                        address.lower(),
                        chain,
                        int(scoring.get("total", 0)),
                        json.dumps(scoring.get("tiers", [])),
                        json.dumps(scoring.get("details", {})),
                    ),
                )
                cur.execute(
                    """
                    INSERT INTO scan_log (wallet_address, chain, scan_status, request_payload, response_payload)
                    VALUES (%s, %s, 'success', %s::jsonb, %s::jsonb)
                    """,
                    (address.lower(), chain, json.dumps({"address": address, "chain": chain}), json.dumps(payload)),
                )
            conn.commit()
    except Exception:
        return


@router.post(
    "/batch",
    summary="Batch scan CSV",
    description="Upload CSV with address,chain columns. Supports up to 500 rows.",
)
async def batch_scan(file: UploadFile = File(...)) -> Dict[str, Any]:
    if not file.filename.lower().endswith(".csv"):
        raise HTTPException(status_code=400, detail="Upload a CSV file with address,chain columns")
    content = await file.read()
    text = content.decode("utf-8", errors="ignore")
    reader = csv.DictReader(io.StringIO(text))

    rows = []
    for row in reader:
        address = (row.get("address") or "").strip()
        chain = (row.get("chain") or "").strip().lower()
        if not address or chain not in SUPPORTED_CHAINS:
            continue
        rows.append({"address": address, "chain": chain})
    if len(rows) > 500:
        raise HTTPException(status_code=400, detail="Maximum 500 rows per batch")

    semaphore = asyncio.Semaphore(20)

    async def run_one(row: dict[str, str]) -> dict[str, Any]:
        async with semaphore:
            try:
                return await scan_wallet(ScanRequest(address=row["address"], chain=row["chain"]))
            except Exception as exc:  # noqa: BLE001
                return {"address": row["address"], "chain": row["chain"], "error": str(exc)}

    tasks = [run_one(row) for row in rows]
    results = []
    for result in await asyncio.gather(*tasks):
        results.append(result)

    return {"count": len(results), "results": results}


def _verify_webhook_signature(body_bytes: bytes, signature: str | None) -> bool:
    secret = os.getenv("WEBHOOK_SHARED_SECRET", "").strip()
    if not secret:
        return False
    if not signature:
        return False
    digest = hmac.new(secret.encode("utf-8"), body_bytes, hashlib.sha256).hexdigest()
    expected = f"sha256={digest}"
    return hmac.compare_digest(expected, signature)


@router.post(
    "/webhook",
    summary="Deposit webhook",
    description="Accept signed deposit event, auto-score sender wallet and trigger alerts.",
)
async def webhook_scan(request: Request, background_tasks: BackgroundTasks) -> Dict[str, Any]:
    raw = await request.body()
    signature = request.headers.get("x-sniffer-signature")
    if not _verify_webhook_signature(raw, signature):
        raise HTTPException(status_code=401, detail="Invalid webhook signature")
    try:
        payload = WebhookRequest.model_validate_json(raw)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=400, detail=f"Invalid webhook payload: {exc}") from exc

    result = await scan_wallet(ScanRequest(address=payload.sender_wallet, chain=payload.chain), background_tasks)
    return {
        "event_id": payload.event_id,
        "webhook_status": "processed",
        "scan_result": result,
    }


@router.get(
    "/alerts/recent",
    summary="Recent whale alerts",
    description="Return alerts with score >= 70 from last 5 minutes.",
)
async def alerts_recent() -> Dict[str, Any]:
    cutoff = datetime.now(timezone.utc) - timedelta(minutes=5)
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT address, chain, score, route, payload::text, created_at
                FROM alerts_log
                WHERE score >= 70 AND created_at >= %s
                ORDER BY created_at DESC
                LIMIT 100
                """,
                (cutoff,),
            )
            rows = cur.fetchall()
    items = [
        {
            "address": row[0],
            "chain": row[1],
            "score": int(row[2]),
            "route": row[3],
            "payload": json.loads(row[4] or "{}"),
            "created_at": row[5].isoformat() if row[5] else None,
        }
        for row in rows
    ]
    return {"count": len(items), "items": items}
