from __future__ import annotations

import os

from fastapi import Header, HTTPException


def require_admin_secret(x_admin_secret: str | None = Header(default=None)) -> None:
    expected = os.getenv("ADMIN_SHARED_SECRET", "").strip()
    if not expected:
        raise HTTPException(status_code=500, detail="ADMIN_SHARED_SECRET is not configured")
    if not x_admin_secret or x_admin_secret != expected:
        raise HTTPException(status_code=401, detail="Unauthorized admin request")
