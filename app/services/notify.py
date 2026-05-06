from __future__ import annotations

import json
import os
from datetime import datetime, timezone
from typing import Any

import httpx

from app.db import get_conn


async def _post_json(url: str, payload: dict[str, Any], timeout: int = 10) -> None:
    async with httpx.AsyncClient(timeout=timeout) as client:
        await client.post(url, json=payload)


async def _send_slack(payload: dict[str, Any]) -> None:
    webhook = os.getenv("SLACK_WEBHOOK_URL", "").strip()
    if not webhook:
        return
    await _post_json(webhook, payload)


async def _send_telegram(text: str) -> None:
    bot_token = os.getenv("TELEGRAM_BOT_TOKEN", "").strip()
    chat_id = os.getenv("TELEGRAM_CHAT_ID", "").strip()
    if not bot_token or not chat_id:
        return
    url = f"https://api.telegram.org/bot{bot_token}/sendMessage"
    await _post_json(url, {"chat_id": chat_id, "text": text})


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
