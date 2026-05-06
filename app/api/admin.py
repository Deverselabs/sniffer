from __future__ import annotations

import json
from typing import Any, Literal

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field

from app.db import get_conn
from app.services.jobs import arkham_sync, etherscan_label_scrape, self_learning_sweep, verify_active_contracts

router = APIRouter(prefix="/api/admin", tags=["admin"])


class ReviewRequest(BaseModel):
    address: str
    chain: Literal["ethereum", "tron", "solana", "all"] = "ethereum"
    action: Literal["approve", "reject", "needs_more"]
    reviewer: str = Field(default="system")
    note: str | None = None


@router.get("/candidates")
async def get_candidates(page: int = Query(1, ge=1), page_size: int = Query(25, ge=1, le=100)) -> dict[str, Any]:
    offset = (page - 1) * page_size
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT address, chain, source, confidence, status, tx_pattern_summary, customer_overlap_count,
                       metadata::text, discovered_at, reviewed_by, reviewed_at
                FROM contract_candidates
                ORDER BY discovered_at DESC
                LIMIT %s OFFSET %s
                """,
                (page_size, offset),
            )
            rows = cur.fetchall()
            cur.execute("SELECT COUNT(*) FROM contract_candidates")
            total = int(cur.fetchone()[0])
            cur.execute("SELECT COUNT(*) FROM contract_candidates WHERE status = 'pending'")
            pending_review = int(cur.fetchone()[0])
            cur.execute("SELECT COUNT(*) FROM gambling_contracts WHERE status = 'verified'")
            total_active = int(cur.fetchone()[0])
            cur.execute("SELECT COUNT(*) FROM gambling_contracts WHERE created_at >= NOW() - INTERVAL '7 days'")
            added_this_week = int(cur.fetchone()[0])
            cur.execute(
                """
                SELECT COUNT(*) FROM gambling_contracts
                WHERE status = 'deprecated' AND updated_at >= NOW() - INTERVAL '7 days'
                """
            )
            deprecated_this_week = int(cur.fetchone()[0])

    items = [
        {
            "address": row[0],
            "chain": row[1],
            "source": row[2],
            "confidence": float(row[3]),
            "status": row[4],
            "tx_pattern_summary": row[5],
            "customer_overlap_count": row[6],
            "metadata": json.loads(row[7] or "{}"),
            "discovered_at": row[8].isoformat() if row[8] else None,
            "reviewed_by": row[9],
            "reviewed_at": row[10].isoformat() if row[10] else None,
        }
        for row in rows
    ]

    return {
        "page": page,
        "page_size": page_size,
        "total": total,
        "items": items,
        "stats": {
            "total_active_contracts": total_active,
            "added_this_week": added_this_week,
            "pending_review_count": pending_review,
            "deprecated_this_week": deprecated_this_week,
        },
    }


@router.post("/review")
async def review_candidate(body: ReviewRequest) -> dict[str, Any]:
    status_map = {"approve": "approved", "reject": "rejected", "needs_more": "needs_more"}
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                UPDATE contract_candidates
                SET status = %s, reviewed_by = %s, reviewed_at = NOW(), review_note = %s
                WHERE address = %s AND chain = %s
                """,
                (status_map[body.action], body.reviewer, body.note, body.address.lower(), body.chain),
            )
            if cur.rowcount == 0:
                raise HTTPException(status_code=404, detail="Candidate not found")

            if body.action == "approve":
                cur.execute(
                    """
                    INSERT INTO gambling_contracts (address, name, chain, status, confidence, source)
                    VALUES (%s, %s, %s, 'verified', 0.700, 'admin_review')
                    ON CONFLICT (address)
                    DO UPDATE SET status = 'verified', chain = EXCLUDED.chain, source = 'admin_review', updated_at = NOW()
                    """,
                    (body.address.lower(), f"reviewed:{body.address[:8]}", body.chain),
                )
            elif body.action == "reject":
                cur.execute(
                    """
                    UPDATE gambling_contracts
                    SET status = 'deprecated', updated_at = NOW()
                    WHERE address = %s
                    """,
                    (body.address.lower(),),
                )

            cur.execute(
                """
                INSERT INTO admin_review_log (address, chain, action, reviewer, note)
                VALUES (%s, %s, %s, %s, %s)
                """,
                (body.address.lower(), body.chain, body.action, body.reviewer, body.note),
            )
        conn.commit()
    return {"ok": True, "address": body.address.lower(), "action": body.action}


@router.post("/jobs/run")
async def run_jobs() -> dict[str, Any]:
    return {
        "self_learning_sweep": await self_learning_sweep(),
        "etherscan_label_scrape": await etherscan_label_scrape(),
        "verify_active_contracts": await verify_active_contracts(),
        "arkham_sync": await arkham_sync(),
    }
