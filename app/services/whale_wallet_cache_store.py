from __future__ import annotations

import json
import logging
import os
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any

from psycopg import errors as pg_errors
from psycopg.types.json import Json

from app.db import get_conn

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class WhaleWalletCacheRow:
    fingerprint: str
    tip_tx_hash: str
    tip_ts: int
    tip_block: int | None
    score: int
    neighbors: list[str]
    updated_at: datetime


def whale_wallet_cache_durable_enabled() -> bool:
    if not os.getenv("DATABASE_URL", "").strip():
        return False
    raw = os.getenv("WHALE_NETWORK_WALLET_CACHE_DURABLE", "1").strip().lower()
    return raw not in ("0", "false", "no", "off")


def whale_wallet_cache_get(chain: str, address_key: str, tx_window: str) -> WhaleWalletCacheRow | None:
    try:
        with get_conn() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT fingerprint, tip_tx_hash, tip_ts, tip_block, score, neighbors, updated_at
                    FROM whale_wallet_scan_cache
                    WHERE chain = %s AND address_key = %s AND tx_window = %s
                    """,
                    (chain.lower(), address_key, tx_window),
                )
                row = cur.fetchone()
        if not row:
            return None
        fp, th, ts, blk, score, neighbors, updated_at = row
        if isinstance(neighbors, str):
            neighbors = json.loads(neighbors)
        nlist = list(neighbors) if isinstance(neighbors, list) else []
        ua = updated_at
        if ua.tzinfo is None:
            ua = ua.replace(tzinfo=timezone.utc)
        return WhaleWalletCacheRow(
            fingerprint=str(fp),
            tip_tx_hash=str(th or ""),
            tip_ts=int(ts or 0),
            tip_block=int(blk) if blk is not None else None,
            score=int(score),
            neighbors=nlist,
            updated_at=ua,
        )
    except pg_errors.UndefinedTable:
        return None
    except Exception as exc:  # noqa: BLE001
        logger.warning("whale_wallet_cache_get failed: %s", exc)
        return None


def whale_wallet_cache_put(
    chain: str,
    address_key: str,
    tx_window: str,
    fingerprint: str,
    tip_tx_hash: str,
    tip_ts: int,
    tip_block: int | None,
    score: int,
    neighbors: list[str],
) -> None:
    try:
        with get_conn() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    INSERT INTO whale_wallet_scan_cache (
                        chain, address_key, tx_window, fingerprint, tip_tx_hash, tip_ts, tip_block,
                        score, neighbors, updated_at
                    )
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, NOW())
                    ON CONFLICT (chain, address_key, tx_window) DO UPDATE SET
                        fingerprint = EXCLUDED.fingerprint,
                        tip_tx_hash = EXCLUDED.tip_tx_hash,
                        tip_ts = EXCLUDED.tip_ts,
                        tip_block = EXCLUDED.tip_block,
                        score = EXCLUDED.score,
                        neighbors = EXCLUDED.neighbors,
                        updated_at = NOW()
                    """,
                    (
                        chain.lower(),
                        address_key,
                        tx_window,
                        fingerprint,
                        tip_tx_hash,
                        tip_ts,
                        tip_block,
                        score,
                        Json(neighbors),
                    ),
                )
            conn.commit()
    except pg_errors.UndefinedTable:
        return
    except Exception as exc:  # noqa: BLE001
        logger.warning("whale_wallet_cache_put failed: %s", exc)
