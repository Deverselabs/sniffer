from __future__ import annotations

import asyncio
from typing import Any

import httpx


class UpstreamHTTPError(RuntimeError):
    pass


async def get_json_with_retry(
    url: str,
    *,
    params: dict[str, Any] | None = None,
    headers: dict[str, str] | None = None,
    timeout: int = 30,
    retries: int = 3,
    backoff_seconds: float = 0.75,
) -> dict[str, Any]:
    last_error: Exception | None = None
    for attempt in range(retries):
        try:
            async with httpx.AsyncClient(timeout=timeout) as client:
                response = await client.get(url, params=params, headers=headers)
            if response.status_code >= 500:
                raise UpstreamHTTPError(f"upstream 5xx: {response.status_code}")
            if response.status_code >= 400:
                raise UpstreamHTTPError(f"upstream 4xx: {response.status_code} {response.text}")
            body = response.json()
            if not isinstance(body, dict):
                raise UpstreamHTTPError("unexpected non-object JSON payload")
            return body
        except (httpx.RequestError, UpstreamHTTPError, ValueError) as exc:
            last_error = exc
            if attempt == retries - 1:
                break
            await asyncio.sleep(backoff_seconds * (2**attempt))
    raise UpstreamHTTPError(str(last_error) if last_error else "unknown upstream error")


async def post_json_with_retry(
    url: str,
    *,
    payload: dict[str, Any],
    headers: dict[str, str] | None = None,
    timeout: int = 30,
    retries: int = 3,
    backoff_seconds: float = 0.75,
) -> dict[str, Any]:
    last_error: Exception | None = None
    for attempt in range(retries):
        try:
            async with httpx.AsyncClient(timeout=timeout) as client:
                response = await client.post(url, json=payload, headers=headers)
            if response.status_code >= 500:
                raise UpstreamHTTPError(f"upstream 5xx: {response.status_code}")
            if response.status_code >= 400:
                raise UpstreamHTTPError(f"upstream 4xx: {response.status_code} {response.text}")
            body = response.json()
            if not isinstance(body, dict):
                raise UpstreamHTTPError("unexpected non-object JSON payload")
            return body
        except (httpx.RequestError, UpstreamHTTPError, ValueError) as exc:
            last_error = exc
            if attempt == retries - 1:
                break
            await asyncio.sleep(backoff_seconds * (2**attempt))
    raise UpstreamHTTPError(str(last_error) if last_error else "unknown upstream error")
