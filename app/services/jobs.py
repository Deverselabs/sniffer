from __future__ import annotations

import json
import os
import re
from datetime import datetime, timedelta, timezone
from typing import Any

import httpx

from app.db import get_conn

ETHERSCAN_BASE = "https://api.etherscan.io/v2/api"


def _log_job(name: str, status: str, payload: dict[str, Any]) -> None:
    try:
        with get_conn() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    INSERT INTO scan_log (wallet_address, chain, scan_status, request_payload, response_payload, created_at)
                    VALUES (%s, 'ethereum', %s, %s::jsonb, %s::jsonb, NOW())
                    """,
                    (f"job:{name}", status, json.dumps({"job": name}), json.dumps(payload)),
                )
            conn.commit()
    except Exception:
        return


async def _etherscan_txlist(address: str, api_key: str) -> list[dict[str, Any]]:
    async with httpx.AsyncClient(timeout=30) as client:
        response = await client.get(
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
        )
    if response.status_code >= 400:
        return []
    body = response.json()
    result = body.get("result", [])
    return result if isinstance(result, list) else []


async def self_learning_sweep() -> dict[str, Any]:
    api_key = os.getenv("ETHERSCAN_API_KEY", "").strip()
    if not api_key:
        payload = {"skipped": True, "reason": "missing ETHERSCAN_API_KEY"}
        _log_job("self_learning_sweep", "partial", payload)
        return payload

    now = datetime.now(timezone.utc)
    cutoff = now - timedelta(hours=24)
    wallets: list[str] = []
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT DISTINCT wallet_address
                FROM wallet_scores
                WHERE chain = 'ethereum' AND scanned_at >= %s
                """,
                (cutoff,),
            )
            wallets = [row[0] for row in cur.fetchall()]

    destination_users: dict[str, set[str]] = {}
    for wallet in wallets:
        txs = await _etherscan_txlist(wallet, api_key)
        for tx in txs:
            if str(tx.get("from", "")).lower() != wallet.lower():
                continue
            destination = str(tx.get("to", "")).lower()
            if not re.fullmatch(r"0x[a-f0-9]{40}", destination):
                continue
            destination_users.setdefault(destination, set()).add(wallet.lower())

    inserted = 0
    with get_conn() as conn:
        with conn.cursor() as cur:
            for destination, users in destination_users.items():
                if len(users) < 10:
                    continue
                cur.execute(
                    """
                    INSERT INTO contract_candidates
                        (address, chain, source, confidence, status, tx_pattern_summary, customer_overlap_count, metadata)
                    VALUES
                        (%s, 'ethereum', 'self_learning_sweep', 0.700, 'pending', %s, %s, %s::jsonb)
                    ON CONFLICT (address, chain, source) DO UPDATE SET
                        customer_overlap_count = EXCLUDED.customer_overlap_count,
                        tx_pattern_summary = EXCLUDED.tx_pattern_summary,
                        metadata = EXCLUDED.metadata
                    """,
                    (
                        destination,
                        "shared outgoing destination used by >=10 scanned users in last 24h",
                        len(users),
                        json.dumps({"users": sorted(list(users))[:100]}),
                    ),
                )
                inserted += 1
        conn.commit()
    payload = {"wallets_checked": len(wallets), "candidates_upserted": inserted}
    _log_job("self_learning_sweep", "success", payload)
    return payload


async def verify_active_contracts() -> dict[str, Any]:
    api_key = os.getenv("ETHERSCAN_API_KEY", "").strip()
    if not api_key:
        payload = {"skipped": True, "reason": "missing ETHERSCAN_API_KEY"}
        _log_job("verify_active_contracts", "partial", payload)
        return payload
    cutoff = datetime.now(timezone.utc) - timedelta(days=90)
    deprecated = 0
    checked = 0
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT address FROM gambling_contracts
                WHERE chain = 'ethereum' AND status = 'verified'
                """
            )
            rows = cur.fetchall()
            for (address,) in rows:
                checked += 1
                txs = await _etherscan_txlist(address, api_key)
                has_recent = False
                for tx in txs[:200]:
                    timestamp = int(tx.get("timeStamp", 0) or 0)
                    if timestamp and datetime.fromtimestamp(timestamp, tz=timezone.utc) >= cutoff:
                        has_recent = True
                        break
                if not has_recent:
                    cur.execute(
                        "UPDATE gambling_contracts SET status = 'deprecated', updated_at = NOW() WHERE address = %s",
                        (address,),
                    )
                    deprecated += 1
        conn.commit()
    payload = {"checked": checked, "deprecated": deprecated}
    _log_job("verify_active_contracts", "success", payload)
    return payload


async def etherscan_label_scrape() -> dict[str, Any]:
    inserted = 0
    try:
        async with httpx.AsyncClient(timeout=30) as client:
            response = await client.get("https://etherscan.io/labelcloud")
        if response.status_code >= 400:
            raise RuntimeError(f"status {response.status_code}")
        html = response.text
        labels = ("gambling", "casino", "betting", "prediction")
        if not any(label in html.lower() for label in labels):
            payload = {"inserted": 0, "note": "label terms not present"}
            _log_job("etherscan_label_scrape", "partial", payload)
            return payload
        addresses = sorted(set(re.findall(r"0x[a-fA-F0-9]{40}", html)))
        with get_conn() as conn:
            with conn.cursor() as cur:
                for address in addresses:
                    cur.execute(
                        """
                        INSERT INTO contract_candidates
                            (address, chain, source, confidence, status, tx_pattern_summary, metadata)
                        VALUES (%s, 'ethereum', 'etherscan_labelcloud', 0.600, 'pending', %s, %s::jsonb)
                        ON CONFLICT (address, chain, source) DO NOTHING
                        """,
                        (
                            address.lower(),
                            "discovered from etherscan labelcloud gambling-related labels",
                            json.dumps({"url": "https://etherscan.io/labelcloud"}),
                        ),
                    )
                    inserted += cur.rowcount
            conn.commit()
    except Exception as exc:  # noqa: BLE001
        payload = {"inserted": 0, "error": str(exc)}
        _log_job("etherscan_label_scrape", "error", payload)
        return payload
    payload = {"inserted": inserted}
    _log_job("etherscan_label_scrape", "success", payload)
    return payload


async def arkham_sync() -> dict[str, Any]:
    api_key = os.getenv("ARKHAM_API_KEY", "").strip()
    if not api_key:
        payload = {"skipped": True, "reason": "missing ARKHAM_API_KEY"}
        _log_job("arkham_sync", "partial", payload)
        return payload
    try:
        async with httpx.AsyncClient(timeout=30) as client:
            response = await client.get(
                "https://api.arkhamintelligence.com/tags",
                params={"q": "gambling,casino,prediction"},
                headers={"Authorization": f"Bearer {api_key}"},
            )
        if response.status_code >= 400:
            raise RuntimeError(f"status {response.status_code}")
        body = response.json()
        items = body.get("results", []) if isinstance(body, dict) else []
        inserted = 0
        with get_conn() as conn:
            with conn.cursor() as cur:
                for row in items:
                    address = str(row.get("address", "")).lower()
                    if not re.fullmatch(r"0x[a-f0-9]{40}", address):
                        continue
                    cur.execute(
                        """
                        INSERT INTO contract_candidates
                            (address, chain, source, confidence, status, tx_pattern_summary, metadata)
                        VALUES (%s, 'ethereum', 'arkham', 0.700, 'pending', %s, %s::jsonb)
                        ON CONFLICT (address, chain, source) DO NOTHING
                        """,
                        (address, "arkham gambling/casino/prediction tag", json.dumps(row)),
                    )
                    inserted += cur.rowcount
            conn.commit()
        payload = {"inserted": inserted}
        _log_job("arkham_sync", "success", payload)
        return payload
    except Exception as exc:  # noqa: BLE001
        payload = {"skipped": True, "error": str(exc)}
        _log_job("arkham_sync", "partial", payload)
        return payload
