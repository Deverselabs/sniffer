from __future__ import annotations

import os
from contextlib import contextmanager
from typing import Iterator

import psycopg


def _database_url() -> str:
    return os.getenv("DATABASE_URL", "").strip()


@contextmanager
def get_conn() -> Iterator[psycopg.Connection]:
    database_url = _database_url()
    if not database_url:
        raise RuntimeError("DATABASE_URL is not configured")
    with psycopg.connect(database_url) as conn:
        yield conn
