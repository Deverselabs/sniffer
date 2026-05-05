from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Iterable, List, Optional

from .config import GAMBLING_VOLUME_BANDS, TIER_CONFIG, TRANSACTION_VOLUME_BANDS_ETH, tier_weights


@dataclass
class TxRecord:
    from_address: str
    to_address: str
    value_eth: float
    timestamp: int


def _weighted_points(weight: int, ratio: float) -> int:
    ratio = max(0.0, min(1.0, ratio))
    return int(round(weight * ratio))


def _to_tx_record(tx: Dict[str, Any], wallet: str) -> TxRecord:
    raw_value = tx.get("value", "0")
    value_eth = float(raw_value) / 1e18
    return TxRecord(
        from_address=str(tx.get("from", "")).lower(),
        to_address=str(tx.get("to", "")).lower(),
        value_eth=value_eth,
        timestamp=int(tx.get("timeStamp", 0)),
    )


def volume_score(txlist: Iterable[Dict[str, Any]], weight: int) -> Dict[str, Any]:
    total_volume = sum(float(tx.get("value", "0")) / 1e18 for tx in txlist)
    ratio = 0.0
    for threshold, band_ratio in TRANSACTION_VOLUME_BANDS_ETH:
        if total_volume >= threshold:
            ratio = band_ratio
            break
    points = _weighted_points(weight, ratio)
    return {
        "points": points,
        "max_points": weight,
        "ratio": ratio,
        "total_volume_eth": round(total_volume, 6),
        "band": next((t for t, r in TRANSACTION_VOLUME_BANDS_ETH if r == ratio), 0),
    }


def gambling_score(
    txlist: Iterable[Dict[str, Any]],
    gambling_contracts: Iterable[str],
    weight: int,
    now: Optional[datetime] = None,
) -> Dict[str, Any]:
    contracts = {address.lower() for address in gambling_contracts}
    now = now or datetime.now(tz=timezone.utc)
    window_90d = now - timedelta(days=90)

    gambling_txs: List[TxRecord] = []
    for raw_tx in txlist:
        tx = _to_tx_record(raw_tx, "")
        if tx.from_address in contracts or tx.to_address in contracts:
            gambling_txs.append(tx)

    interaction_count = len(gambling_txs)
    platform_count = len(
        {
            tx.from_address if tx.from_address in contracts else tx.to_address
            for tx in gambling_txs
        }
    )
    frequency_90d = sum(1 for tx in gambling_txs if datetime.fromtimestamp(tx.timestamp, tz=timezone.utc) >= window_90d)
    most_recent_days = None
    if gambling_txs:
        latest = max(tx.timestamp for tx in gambling_txs)
        most_recent_days = max(0, int((now - datetime.fromtimestamp(latest, tz=timezone.utc)).days))

    base_ratio = 0.0
    for threshold, ratio in GAMBLING_VOLUME_BANDS:
        if interaction_count >= threshold:
            base_ratio = ratio
            break

    platform_bonus = min(0.2, platform_count * 0.03)
    frequency_bonus = 0.15 if frequency_90d >= 20 else 0.1 if frequency_90d >= 8 else 0.05 if frequency_90d >= 3 else 0.0
    recency_bonus = 0.1 if most_recent_days is not None and most_recent_days <= 7 else 0.05 if most_recent_days is not None and most_recent_days <= 30 else 0.0
    final_ratio = min(1.0, base_ratio + platform_bonus + frequency_bonus + recency_bonus)

    return {
        "points": _weighted_points(weight, final_ratio),
        "max_points": weight,
        "base_ratio": round(base_ratio, 3),
        "platform_bonus": round(platform_bonus, 3),
        "frequency_90d_bonus": round(frequency_bonus, 3),
        "recency_bonus": round(recency_bonus, 3),
        "final_ratio": round(final_ratio, 3),
        "interaction_count": interaction_count,
        "platform_count": platform_count,
        "frequency_90d": frequency_90d,
        "most_recent_days": most_recent_days,
    }


def score(
    address: str,
    *,
    txlist: Optional[Iterable[Dict[str, Any]]] = None,
    gambling_contracts: Optional[Iterable[str]] = None,
    balance_eth: float = 0.0,
    eth_price_usd: float = 0.0,
) -> Dict[str, Any]:
    weights = tier_weights()
    txs = list(txlist or [])
    contracts = list(gambling_contracts or [])

    total_received_eth = sum(float(tx.get("value", "0")) / 1e18 for tx in txs if str(tx.get("to", "")).lower() == address.lower())
    total_received_usd = total_received_eth * eth_price_usd

    t1_ratio = 1.0 if total_received_usd >= 250000 else 0.8 if total_received_usd >= 50000 else 0.5 if total_received_usd >= 10000 else 0.2 if total_received_usd >= 1000 else 0.0
    t1_points = _weighted_points(weights["t1_wallet_wealth"], t1_ratio)
    t2 = gambling_score(txs, contracts, weights["t2_gambling_signal"])
    t3 = volume_score(txs, weights["t3_transaction_volume"])

    oldest_ts = min((int(tx.get("timeStamp", 0)) for tx in txs), default=0)
    age_days = int((datetime.now(tz=timezone.utc).timestamp() - oldest_ts) / 86400) if oldest_ts else 0
    t4_ratio = 1.0 if age_days >= 730 else 0.75 if age_days >= 365 else 0.5 if age_days >= 180 else 0.25 if age_days >= 30 else 0.0
    t4_points = _weighted_points(weights["t4_wallet_age"], t4_ratio)

    unique_senders = len({str(tx.get("from", "")).lower() for tx in txs if str(tx.get("to", "")).lower() == address.lower()})
    t5_ratio = 1.0 if unique_senders >= 100 else 0.75 if unique_senders >= 40 else 0.5 if unique_senders >= 15 else 0.25 if unique_senders >= 5 else 0.0
    t5_points = _weighted_points(weights["t5_unique_senders"], t5_ratio)

    avg_ticket = total_received_eth / max(1, len(txs))
    t6_ratio = 1.0 if avg_ticket >= 5 else 0.75 if avg_ticket >= 2 else 0.5 if avg_ticket >= 0.5 else 0.25 if avg_ticket >= 0.1 else 0.0
    t6_points = _weighted_points(weights["t6_avg_ticket_size"], t6_ratio)

    recent_cutoff = datetime.now(tz=timezone.utc) - timedelta(days=30)
    recent_count = sum(1 for tx in txs if datetime.fromtimestamp(int(tx.get("timeStamp", 0)), tz=timezone.utc) >= recent_cutoff)
    t7_ratio = 1.0 if recent_count >= 50 else 0.75 if recent_count >= 20 else 0.5 if recent_count >= 8 else 0.25 if recent_count >= 3 else 0.0
    t7_points = _weighted_points(weights["t7_recent_activity"], t7_ratio)

    large_deposits = sum(1 for tx in txs if float(tx.get("value", "0")) / 1e18 >= 10)
    t8_ratio = 1.0 if large_deposits >= 10 else 0.75 if large_deposits >= 5 else 0.5 if large_deposits >= 2 else 0.25 if large_deposits >= 1 else 0.0
    t8_points = _weighted_points(weights["t8_large_deposit_count"], t8_ratio)

    t9_ratio = 1.0 if balance_eth >= 200 else 0.75 if balance_eth >= 75 else 0.5 if balance_eth >= 20 else 0.25 if balance_eth >= 5 else 0.0
    t9_points = _weighted_points(weights["t9_balance_strength"], t9_ratio)

    risk_ratio = 0.0 if t2["interaction_count"] == 0 else 0.5 if t2["interaction_count"] < 5 else 1.0
    t10_points = _weighted_points(weights["t10_risk_penalty"], risk_ratio)

    tiers = [
        {"id": tier.id, "label": tier.label, "max_points": tier.weight, "points": 0}
        for tier in TIER_CONFIG
    ]
    points_map = {
        "t1_wallet_wealth": t1_points,
        "t2_gambling_signal": t2["points"],
        "t3_transaction_volume": t3["points"],
        "t4_wallet_age": t4_points,
        "t5_unique_senders": t5_points,
        "t6_avg_ticket_size": t6_points,
        "t7_recent_activity": t7_points,
        "t8_large_deposit_count": t8_points,
        "t9_balance_strength": t9_points,
        "t10_risk_penalty": t10_points,
    }
    for tier in tiers:
        tier["points"] = points_map[tier["id"]]

    total = min(100, sum(tier["points"] for tier in tiers))
    return {
        "address": address,
        "total": total,
        "tiers": tiers,
        "details": {
            "t2_gambling_signal": t2,
            "t3_transaction_volume": t3,
            "total_received_eth": round(total_received_eth, 6),
            "total_received_usd": round(total_received_usd, 2),
        },
    }
