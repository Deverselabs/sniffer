from __future__ import annotations

import asyncio
import os
from typing import Any, Dict, List

import httpx

SOLANA_RPC_URL = os.getenv("SOLANA_RPC_URL", "https://api.mainnet-beta.solana.com")


class SolanaServiceError(RuntimeError):
    pass


async def _rpc_call(method: str, params: list[Any]) -> Dict[str, Any]:
    payload = {"jsonrpc": "2.0", "id": 1, "method": method, "params": params}
    async with httpx.AsyncClient(timeout=30) as client:
        response = await client.post(SOLANA_RPC_URL, json=payload)
    if response.status_code >= 400:
        raise SolanaServiceError(f"Solana RPC failed: {response.status_code} {response.text}")
    body = response.json()
    if body.get("error"):
        raise SolanaServiceError(f"Solana RPC error: {body['error']}")
    return body


async def sol_balance(address: str) -> float:
    body = await _rpc_call("getBalance", [address, {"commitment": "confirmed"}])
    lamports = body.get("result", {}).get("value", 0)
    return float(lamports) / 1_000_000_000


async def sol_deposits(address: str, limit: int = 200, batch_size: int = 25) -> List[Dict[str, Any]]:
    sigs_body = await _rpc_call("getSignaturesForAddress", [address, {"limit": limit}])
    signatures = [row.get("signature") for row in sigs_body.get("result", []) if row.get("signature")]
    if not signatures:
        return []

    deposits: List[Dict[str, Any]] = []
    for idx in range(0, len(signatures), batch_size):
        batch = signatures[idx : idx + batch_size]
        async with httpx.AsyncClient(timeout=60) as client:
            tasks = [
                client.post(
                    SOLANA_RPC_URL,
                    json={
                        "jsonrpc": "2.0",
                        "id": signature,
                        "method": "getTransaction",
                        "params": [signature, {"encoding": "jsonParsed", "maxSupportedTransactionVersion": 0}],
                    },
                )
                for signature in batch
            ]
            responses = await asyncio.gather(*tasks)

        for response in responses:
            if response.status_code >= 400:
                continue
            payload = response.json()
            result = payload.get("result")
            if not result:
                continue
            block_time = result.get("blockTime")
            if not block_time:
                continue
            meta = result.get("meta") or {}
            tx = result.get("transaction") or {}
            message = tx.get("message") or {}
            account_keys = message.get("accountKeys") or []
            pre_balances = meta.get("preBalances") or []
            post_balances = meta.get("postBalances") or []
            if not account_keys or len(pre_balances) != len(post_balances):
                continue
            def key_value(entry: Any) -> str:
                if isinstance(entry, str):
                    return entry
                if isinstance(entry, dict):
                    return str(entry.get("pubkey", ""))
                return ""

            recipient_index = next((i for i, key in enumerate(account_keys) if key_value(key) == address), None)
            if recipient_index is None:
                continue
            delta_lamports = int(post_balances[recipient_index]) - int(pre_balances[recipient_index])
            if delta_lamports <= 0:
                continue
            from_addr = next((key_value(k) for i, k in enumerate(account_keys) if i != recipient_index), "unknown")
            deposits.append(
                {
                    "hash": tx.get("signatures", [""])[0],
                    "from": from_addr,
                    "to": address,
                    "value_native": delta_lamports / 1_000_000_000,
                    "timestamp": int(block_time),
                }
            )

    return deposits
