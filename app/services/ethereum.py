from __future__ import annotations

from typing import Any, Dict, List, Optional

from app.services.http_client import UpstreamHTTPError, get_json_with_retry

ETHERSCAN_BASE = "https://api.etherscan.io/v2/api"


class EthereumServiceError(RuntimeError):
    pass


def _etherscan_wei_balance_to_eth(result: Any) -> float:
    """Parse Etherscan `balance` action result (wei as decimal string); error strings raise."""
    if result is None:
        return 0.0
    if isinstance(result, bool):
        return 0.0
    if isinstance(result, int):
        return float(result) / 1e18
    if isinstance(result, float):
        return int(result) / 1e18
    s = str(result).strip()
    if not s:
        return 0.0
    if s.isdigit() or (s[0] == "-" and len(s) > 1 and s[1:].isdigit()):
        return int(s) / 1e18
    raise EthereumServiceError(f"Etherscan balance error: {s[:400]}")


def _etherscan_ethusd(price_result: Any) -> float:
    if price_result is None:
        return 0.0
    if isinstance(price_result, str) and price_result.strip():
        raise EthereumServiceError(f"Etherscan ethprice error: {price_result[:400]}")
    if not isinstance(price_result, dict):
        return 0.0
    raw = price_result.get("ethusd", 0) or 0
    try:
        return float(raw)
    except (TypeError, ValueError) as exc:
        raise EthereumServiceError(f"Etherscan ethprice bad value: {raw!r}") from exc


async def eth_snapshot(address: str, api_key: str) -> Dict[str, Any]:
    params_common = {"chainid": 1, "apikey": api_key}
    try:
        bal_body = await get_json_with_retry(
            ETHERSCAN_BASE,
            params={**params_common, "module": "account", "action": "balance", "address": address, "tag": "latest"},
            timeout=30,
        )
        tx_body = await get_json_with_retry(
            ETHERSCAN_BASE,
            params={
                **params_common,
                "module": "account",
                "action": "txlist",
                "address": address,
                "startblock": 0,
                "endblock": 99999999,
                "sort": "desc",
            },
            timeout=30,
        )
        price_body = await get_json_with_retry(
            ETHERSCAN_BASE,
            params={**params_common, "module": "stats", "action": "ethprice"},
            timeout=20,
            retries=2,
        )
    except UpstreamHTTPError as exc:
        raise EthereumServiceError(f"Etherscan request failed: {exc}") from exc
    balance_eth = _etherscan_wei_balance_to_eth(bal_body.get("result"))
    eth_price = _etherscan_ethusd(price_body.get("result"))
    raw_txs = tx_body.get("result", [])
    if isinstance(raw_txs, str):
        raise EthereumServiceError(f"Etherscan txlist error: {raw_txs[:500]}")
    deposits: List[Dict[str, Any]] = []
    for tx in raw_txs if isinstance(raw_txs, list) else []:
        if str(tx.get("to", "")).lower() != address.lower():
            continue
        try:
            value = float(tx.get("value", "0")) / 1e18
        except (TypeError, ValueError):
            continue
        if value <= 0:
            continue
        deposits.append(
            {
                "hash": tx.get("hash", ""),
                "from": tx.get("from", ""),
                "to": tx.get("to", ""),
                "value_native": value,
                "timestamp": int(tx.get("timeStamp", 0)),
            }
        )
    return {"balance": balance_eth, "deposits": deposits, "price_usd": eth_price}
