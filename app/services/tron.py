from __future__ import annotations

from typing import Any, Dict, List

from app.services.http_client import UpstreamHTTPError, get_json_with_retry

TRONGRID_BASE_URL = "https://api.trongrid.io/v1"


class TronServiceError(RuntimeError):
    pass


async def tron_balance(address: str, api_key: str | None = None) -> float:
    headers = {"TRON-PRO-API-KEY": api_key} if api_key else {}
    url = f"{TRONGRID_BASE_URL}/accounts/{address}"
    try:
        payload = await get_json_with_retry(url, headers=headers, timeout=20)
    except UpstreamHTTPError as exc:
        raise TronServiceError(f"TronGrid balance failed: {exc}") from exc
    account_rows = payload.get("data", [])
    if not account_rows:
        return 0.0
    raw_balance = account_rows[0].get("balance", 0)
    try:
        balance_sun = int(raw_balance or 0)
    except (TypeError, ValueError) as exc:
        raise TronServiceError(f"Unexpected Tron balance payload: {raw_balance}") from exc
    return balance_sun / 1_000_000


async def tron_deposits(address: str, api_key: str | None = None, limit: int = 200) -> List[Dict[str, Any]]:
    headers = {"TRON-PRO-API-KEY": api_key} if api_key else {}
    url = f"{TRONGRID_BASE_URL}/accounts/{address}/transactions"
    params = {"only_to": "true", "limit": str(limit), "order_by": "block_timestamp,desc"}

    try:
        payload = await get_json_with_retry(url, params=params, headers=headers, timeout=30)
    except UpstreamHTTPError as exc:
        raise TronServiceError(f"TronGrid deposits failed: {exc}") from exc
    tx_rows = payload.get("data", [])
    if not isinstance(tx_rows, list):
        raise TronServiceError("Unexpected TronGrid transactions payload shape")
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
