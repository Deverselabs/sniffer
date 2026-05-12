"""Short TTL in-process cache for wallet /scan JSON payloads (bulk + repeat views)."""

from __future__ import annotations

import copy
import time
from typing import Any

_TTL_SEC = 120.0
_MAX_KEYS = 2000
_store: dict[str, tuple[float, dict[str, Any]]] = {}


def _cache_key(chain: str, address: str) -> str:
    c = chain.strip().lower()
    a = address.strip().lower() if c == "ethereum" else address.strip()
    return f"{c}:{a}"


def scan_result_cache_get(chain: str, address: str) -> dict[str, Any] | None:
    k = _cache_key(chain, address)
    now = time.monotonic()
    ent = _store.get(k)
    if not ent:
        return None
    exp_at, payload = ent
    if now > exp_at:
        del _store[k]
        return None
    return copy.deepcopy(payload)


def scan_result_cache_put(chain: str, address: str, payload: dict[str, Any]) -> None:
    if len(_store) >= _MAX_KEYS:
        # Drop arbitrary entries to cap memory (bulk CSV edge case).
        for drop_k in list(_store.keys())[: max(1, len(_store) // 5)]:
            _store.pop(drop_k, None)
    k = _cache_key(chain, address)
    _store[k] = (time.monotonic() + _TTL_SEC, copy.deepcopy(payload))
