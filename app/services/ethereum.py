from __future__ import annotations

from typing import Any, Dict, List, Optional

import httpx

ETHERSCAN_BASE = "https://api.etherscan.io/v2/api"


class EthereumServiceError(RuntimeError):
    pass


async def eth_snapshot(address: str, api_key: str) -> Dict[str, Any]:
    params_common = {"chainid": 1, "apikey": api_key}
    async with httpx.AsyncClient(timeout=30) as client:
        bal_req = client.get(
            ETHERSCAN_BASE,
            params={**params_common, "module": "account", "action": "balance", "address": address, "tag": "latest"},
        )
        tx_req = client.get(
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
        )
        price_req = client.get(
            ETHERSCAN_BASE,
            params={**params_common, "module": "stats", "action": "ethprice"},
        )
        bal_res, tx_res, price_res = await bal_req, await tx_req, await price_req

    if bal_res.status_code >= 400 or tx_res.status_code >= 400:
        raise EthereumServiceError("Etherscan request failed.")
    bal_body = bal_res.json()
    tx_body = tx_res.json()
    price_body = price_res.json() if price_res.status_code < 400 else {}
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
