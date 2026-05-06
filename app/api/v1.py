from __future__ import annotations

import csv
import io
import os
import asyncio
from typing import Any, Dict, Literal

from fastapi import APIRouter, File, HTTPException, UploadFile
from pydantic import BaseModel, Field

from app.services.ethereum import eth_snapshot
from app.services.scorer import score
from app.services.solana import sol_balance, sol_deposits
from app.services.tron import tron_balance, tron_deposits
from app.utils.validators import validate_address

router = APIRouter(prefix="/api/v1", tags=["scan"])
SUPPORTED_CHAINS = {"ethereum", "tron", "solana"}


class ScanRequest(BaseModel):
    address: str = Field(..., min_length=2)
    chain: Literal["ethereum", "tron", "solana"] = "ethereum"


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


@router.post("/scan")
async def scan_wallet(body: ScanRequest) -> Dict[str, Any]:
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

    return {
        "address": address,
        "chain": chain,
        "balance": snapshot["balance"],
        "deposits": snapshot["deposits"],
        "score": scoring,
    }


@router.post("/batch")
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
