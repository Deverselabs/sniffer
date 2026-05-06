from __future__ import annotations

from typing import Any, Dict, List

import httpx

TRONGRID_BASE_URL = "https://api.trongrid.io/v1"


class TronServiceError(RuntimeError):
    pass


async def tron_balance(address: str, api_key: str | None = None) -> float:
    headers = {"TRON-PRO-API-KEY": api_key} if api_key else {}
    url = f"{TRONGRID_BASE_URL}/accounts/{address}"
    async with httpx.AsyncClient(timeout=20) as client:
        response = await client.get(url, headers=headers)
    if response.status_code >= 400:
        raise TronServiceError(f"TronGrid balance failed: {response.status_code} {response.text}")
    payload = response.json()
    account_rows = payload.get("data", [])
    if not account_rows:
        return 0.0
    balance_sun = int(account_rows[0].get("balance", 0))
    return balance_sun / 1_000_000


async def tron_deposits(address: str, api_key: str | None = None, limit: int = 200) -> List[Dict[str, Any]]:
    headers = {"TRON-PRO-API-KEY": api_key} if api_key else {}
    url = f"{TRONGRID_BASE_URL}/accounts/{address}/transactions"
    params = {"only_to": "true", "limit": str(limit), "order_by": "block_timestamp,desc"}

    async with httpx.AsyncClient(timeout=30) as client:
        response = await client.get(url, params=params, headers=headers)
    if response.status_code >= 400:
        raise TronServiceError(f"TronGrid deposits failed: {response.status_code} {response.text}")

    tx_rows = response.json().get("data", [])
    results: List[Dict[str, Any]] = []
    for tx in tx_rows:
        raw_data = tx.get("raw_data", {})
        contracts = raw_data.get("contract", [])
        if not contracts:
            continue
        parameter = contracts[0].get("parameter", {}).get("value", {})
        owner = parameter.get("owner_address")
        to_address = parameter.get("to_address")
        amount_sun = parameter.get("amount")
        if owner is None or to_address is None or amount_sun is None:
            continue
        results.append(
            {
                "hash": tx.get("txID", ""),
                "from": owner,
                "to": to_address,
                "value_native": float(amount_sun) / 1_000_000,
                "timestamp": int(tx.get("block_timestamp", 0)) // 1000,
            }
        )
    return results
