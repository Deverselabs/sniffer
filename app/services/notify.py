from __future__ import annotations

import json
import logging
import os
from collections.abc import Iterable
from datetime import datetime, timezone
from typing import Any

import httpx

from app.db import get_conn

logger = logging.getLogger(__name__)


async def _post_json(url: str, payload: dict[str, Any], timeout: int = 10) -> None:
    async with httpx.AsyncClient(timeout=timeout) as client:
        await client.post(url, json=payload)


async def _send_slack(payload: dict[str, Any]) -> None:
    webhook = os.getenv("SLACK_WEBHOOK_URL", "").strip()
    if not webhook:
        return
    await _post_json(webhook, payload)


async def send_telegram_text(text: str, *, chat_id: str | None = None) -> bool:
    """
    Send a Telegram message using TELEGRAM_BOT_TOKEN.
    If chat_id is omitted, uses TELEGRAM_CHAT_ID (legacy whale / alert routing).
    """
    bot_token = os.getenv("TELEGRAM_BOT_TOKEN", "").strip()
    cid = (chat_id or "").strip() or os.getenv("TELEGRAM_CHAT_ID", "").strip()
    if not bot_token or not cid:
        return False
    url = f"https://api.telegram.org/bot{bot_token}/sendMessage"
    safe = text[:4090] if len(text) > 4090 else text
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            response = await client.post(url, json={"chat_id": cid, "text": safe})
        if response.status_code != 200:
            logger.warning(
                "Telegram sendMessage HTTP %s for chat_id …%s: %s",
                response.status_code,
                cid[-8:],
                response.text[:300],
            )
        return response.status_code == 200
    except (httpx.RequestError, ValueError) as exc:
        logger.warning("Telegram sendMessage request error for chat_id …%s: %s", cid[-8:], exc)
        return False


async def send_telegram_text_to_chats(text: str, *, chat_ids: Iterable[str]) -> None:
    """
    Send the same text to each distinct non-empty chat_id.
    Each destination is tried independently; one failure does not block others.
    """
    seen: set[str] = set()
    for raw in chat_ids:
        cid = (raw or "").strip()
        if not cid or cid in seen:
            continue
        seen.add(cid)
        try:
            ok = await send_telegram_text(text, chat_id=cid)
            if not ok:
                logger.warning("Telegram sendMessage returned failure for chat_id …%s", cid[-8:])
        except Exception:  # noqa: BLE001
            logger.exception("Telegram sendMessage raised for chat_id …%s", cid[-8:])


async def _send_telegram(text: str) -> None:
    await send_telegram_text(text, chat_id=None)


def _queue_digest(payload: dict[str, Any]) -> None:
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO digest_email_queue (address, chain, score, payload, queued_at)
                VALUES (%s, %s, %s, %s::jsonb, NOW())
                """,
                (
                    payload.get("address", ""),
                    payload.get("chain", "ethereum"),
                    int(payload.get("score", 0)),
                    json.dumps(payload),
                ),
            )
        conn.commit()


def _persist_alert(payload: dict[str, Any], route: str) -> None:
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO alerts_log (address, chain, score, route, payload, created_at)
                VALUES (%s, %s, %s, %s, %s::jsonb, NOW())
                """,
                (
                    payload.get("address", "").lower(),
                    payload.get("chain", "ethereum"),
                    int(payload.get("score", 0)),
                    route,
                    json.dumps(payload),
                ),
            )
        conn.commit()


async def notify(payload: dict[str, Any]) -> dict[str, Any]:
    score = int(payload.get("score", 0))
    event = {
        **payload,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }
    if score >= 90:
        await _send_telegram(f"[P0] Whale {payload.get('address')} scored {score}")
        await _send_slack({"text": f":rotating_light: P0 Whale alert {payload.get('address')} score={score}"})
        _persist_alert(event, "p0_telegram_slack")
        return {"route": "p0_telegram_slack"}
    if score >= 70:
        await _send_slack({"text": f":warning: Whale alert {payload.get('address')} score={score}"})
        _persist_alert(event, "slack")
        return {"route": "slack"}
    if score >= 50:
        _queue_digest(event)
        _persist_alert(event, "digest_queue")
        return {"route": "digest_queue"}
    return {"route": "none"}
