from __future__ import annotations

from typing import Any, Dict, List, Optional

from app.services.http_client import UpstreamHTTPError, get_json_with_retry

ETHERSCAN_BASE = "https://api.etherscan.io/v2/api"


class EthereumServiceError(RuntimeError):
    pass


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
    balance_eth = float(bal_body.get("result", "0")) / 1e18 if bal_body.get("result") else 0.0
    eth_price = float(price_body.get("result", {}).get("ethusd", 0) or 0)
    raw_txs = tx_body.get("result", [])
    deposits: List[Dict[str, Any]] = []
    for tx in raw_txs if isinstance(raw_txs, list) else []:
        if str(tx.get("to", "")).lower() != address.lower():
            continue
        value = float(tx.get("value", "0")) / 1e18
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
