import json
import os
from pathlib import Path

import psycopg


ROOT = Path(__file__).resolve().parent.parent
DATA_FILE = ROOT / "data" / "gambling.json"


def main() -> None:
    database_url = os.getenv("DATABASE_URL", "postgresql://postgres:postgres@localhost:5432/sniffer")
    records = json.loads(DATA_FILE.read_text(encoding="utf-8"))

    with psycopg.connect(database_url) as conn:
        with conn.cursor() as cur:
            for record in records:
                cur.execute(
                    """
                    INSERT INTO gambling_contracts (address, name, status, confidence, source, chain)
                    VALUES (%s, %s, %s, %s, %s, %s)
                    ON CONFLICT (address) DO UPDATE SET
                        name = EXCLUDED.name,
                        status = EXCLUDED.status,
                        confidence = EXCLUDED.confidence,
                        source = EXCLUDED.source,
                        updated_at = NOW()
                    """,
                    (
                        record["address"].lower(),
                        record["name"],
                        record["status"],
                        record["confidence"],
                        record["source"],
                        record.get("chain", "ethereum"),
                    ),
                )
        conn.commit()

    verified = sum(1 for record in records if record["status"] == "verified")
    candidate = sum(1 for record in records if record["status"] == "candidate")
    print(f"Seed completed. Imported {len(records)} records ({verified} verified, {candidate} candidate).")


if __name__ == "__main__":
    main()
