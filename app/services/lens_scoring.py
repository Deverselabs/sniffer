"""Whale Radar lens totals — mirrors frontend `src/utils/whaleScore.ts` (computeWhaleScore)."""

from __future__ import annotations

import time
from typing import Any, Dict, List, Literal, TypedDict

IndustryProfile = Literal["casino", "risk", "marketing", "exchange", "defi"]


class _Weights(TypedDict):
    t1WalletWealth: int
    t2GamblingSignal: int
    t3TransactionVolume: int
    t4WalletAge: int
    t5UniqueSenders: int
    t6AvgDepositSize: int
    t7RecentActivity: int
    t8LargeDepositCount: int
    t9BalanceStrength: int
    t10RiskAdjustment: int


_INDUSTRY_PROFILES: Dict[IndustryProfile, Dict[str, Any]] = {
    "casino": {
        "label": "Crypto Casino",
        "emoji": "🎰",
        "weights": {
            "t1WalletWealth": 15,
            "t2GamblingSignal": 18,
            "t3TransactionVolume": 10,
            "t4WalletAge": 8,
            "t5UniqueSenders": 8,
            "t6AvgDepositSize": 10,
            "t7RecentActivity": 10,
            "t8LargeDepositCount": 10,
            "t9BalanceStrength": 6,
            "t10RiskAdjustment": 5,
        },
    },
    "risk": {
        "label": "Risk & Compliance",
        "emoji": "🛡️",
        "weights": {
            "t1WalletWealth": 12,
            "t2GamblingSignal": 8,
            "t3TransactionVolume": 12,
            "t4WalletAge": 12,
            "t5UniqueSenders": 8,
            "t6AvgDepositSize": 8,
            "t7RecentActivity": 10,
            "t8LargeDepositCount": 10,
            "t9BalanceStrength": 15,
            "t10RiskAdjustment": 5,
        },
    },
    "marketing": {
        "label": "Marketing & CRM",
        "emoji": "📣",
        "weights": {
            "t1WalletWealth": 18,
            "t2GamblingSignal": 6,
            "t3TransactionVolume": 12,
            "t4WalletAge": 8,
            "t5UniqueSenders": 10,
            "t6AvgDepositSize": 12,
            "t7RecentActivity": 10,
            "t8LargeDepositCount": 10,
            "t9BalanceStrength": 9,
            "t10RiskAdjustment": 5,
        },
    },
    "exchange": {
        "label": "Crypto Exchange",
        "emoji": "🏦",
        "weights": {
            "t1WalletWealth": 14,
            "t2GamblingSignal": 14,
            "t3TransactionVolume": 14,
            "t4WalletAge": 8,
            "t5UniqueSenders": 10,
            "t6AvgDepositSize": 10,
            "t7RecentActivity": 10,
            "t8LargeDepositCount": 10,
            "t9BalanceStrength": 5,
            "t10RiskAdjustment": 5,
        },
    },
    "defi": {
        "label": "DeFi Protocol",
        "emoji": "⚡",
        "weights": {
            "t1WalletWealth": 15,
            "t2GamblingSignal": 10,
            "t3TransactionVolume": 15,
            "t4WalletAge": 10,
            "t5UniqueSenders": 10,
            "t6AvgDepositSize": 10,
            "t7RecentActivity": 10,
            "t8LargeDepositCount": 10,
            "t9BalanceStrength": 5,
            "t10RiskAdjustment": 5,
        },
    },
}

GAMBLING_CONTRACTS = frozenset(
    {
        "0x0000000000000000000000000000000000000000",
        "0xb5c457ddb4ce3312a6c5a2b056a1652bd542a208",
        "0x28ade70258dab1f7f3f4f4e0f2c29f4e1a45e0f5",
        "0x68b3465833fb72a70ecdf485e0e4c7bd8665fc45",
        "0x1111111254fb6c44bac0bed2854e76f90643097d",
        "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
        "0xdac17f958d2ee523a2206206994597c13d831ec7",
        "0x6b175474e89094c44da98b954eedeac495271d0f",
    }
)


def _weighted_points(weight: int, percent: float) -> int:
    return int(round(weight * max(0.0, min(1.0, percent))))


def compute_whale_score_total(
    *,
    balance_eth: float,
    eth_price_usd: float,
    unique_senders: int,
    incoming_tx: List[Dict[str, Any]],
    profile: IndustryProfile,
) -> int:
    """Return 0–100 total score for one industry profile (matches TS `computeWhaleScore(...).total`)."""
    w = _INDUSTRY_PROFILES[profile]["weights"]
    assert isinstance(w, dict)
    weights: _Weights = w  # type: ignore[assignment]

    now = time.time()
    timestamps = [int(tx["timestamp"]) for tx in incoming_tx if tx.get("timestamp") is not None]
    oldest_ts = min(timestamps) if timestamps else None
    wallet_age_days = (now - oldest_ts) / (24 * 60 * 60) if oldest_ts else 0.0

    total_eth_received = sum(float(tx.get("value_eth", 0) or 0) for tx in incoming_tx)
    total_usd_received = total_eth_received * float(eth_price_usd or 0)

    t1_wallet_wealth = (
        _weighted_points(weights["t1WalletWealth"], 1.0)
        if total_usd_received >= 250000
        else _weighted_points(weights["t1WalletWealth"], 0.8)
        if total_usd_received >= 50000
        else _weighted_points(weights["t1WalletWealth"], 0.48)
        if total_usd_received >= 10000
        else _weighted_points(weights["t1WalletWealth"], 0.2)
        if total_usd_received >= 1000
        else 0
    )

    gambling_tx_count = sum(
        1 for tx in incoming_tx if str(tx.get("from", "")).lower() in GAMBLING_CONTRACTS
    )
    gambling_platforms = len(
        {
            str(tx.get("from", "")).lower()
            for tx in incoming_tx
            if str(tx.get("from", "")).lower() in GAMBLING_CONTRACTS
        }
    )
    ninety_days_ago = now - 90 * 24 * 60 * 60
    gambling_last_90d = sum(
        1
        for tx in incoming_tx
        if float(tx.get("timestamp", 0)) >= ninety_days_ago
        and str(tx.get("from", "")).lower() in GAMBLING_CONTRACTS
    )
    gambling_txs_sorted = sorted(
        (tx for tx in incoming_tx if str(tx.get("from", "")).lower() in GAMBLING_CONTRACTS),
        key=lambda t: float(t.get("timestamp", 0)),
        reverse=True,
    )
    latest_gambling = gambling_txs_sorted[0] if gambling_txs_sorted else None
    recency_days = (
        (now - float(latest_gambling["timestamp"])) / (24 * 60 * 60) if latest_gambling else float("inf")
    )

    base_gambling_ratio = (
        1.0
        if gambling_tx_count >= 30
        else 0.8
        if gambling_tx_count >= 10
        else 0.57
        if gambling_tx_count >= 3
        else 0.29
        if gambling_tx_count >= 1
        else 0.0
    )
    platform_bonus = min(0.2, gambling_platforms * 0.03)
    frequency_bonus = (
        0.15 if gambling_last_90d >= 20 else 0.1 if gambling_last_90d >= 8 else 0.05 if gambling_last_90d >= 3 else 0.0
    )
    recency_bonus = 0.1 if recency_days <= 7 else 0.05 if recency_days <= 30 else 0.0
    gambling = _weighted_points(
        weights["t2GamblingSignal"],
        min(1.0, base_gambling_ratio + platform_bonus + frequency_bonus + recency_bonus),
    )

    age = (
        _weighted_points(weights["t4WalletAge"], 1.0)
        if wallet_age_days >= 730
        else _weighted_points(weights["t4WalletAge"], 0.75)
        if wallet_age_days >= 365
        else _weighted_points(weights["t4WalletAge"], 0.5)
        if wallet_age_days >= 180
        else _weighted_points(weights["t4WalletAge"], 0.25)
        if wallet_age_days >= 30
        else 0
    )

    volume = (
        _weighted_points(weights["t3TransactionVolume"], 1.0)
        if total_eth_received >= 100
        else _weighted_points(weights["t3TransactionVolume"], 0.75)
        if total_eth_received >= 50
        else _weighted_points(weights["t3TransactionVolume"], 0.5)
        if total_eth_received >= 10
        else _weighted_points(weights["t3TransactionVolume"], 0.25)
        if total_eth_received >= 1
        else 0
    )

    t5_unique_senders = (
        _weighted_points(weights["t5UniqueSenders"], 1.0)
        if unique_senders >= 100
        else _weighted_points(weights["t5UniqueSenders"], 0.75)
        if unique_senders >= 40
        else _weighted_points(weights["t5UniqueSenders"], 0.5)
        if unique_senders >= 15
        else _weighted_points(weights["t5UniqueSenders"], 0.25)
        if unique_senders >= 5
        else 0
    )

    n_tx = max(1, len(incoming_tx))
    avg_deposit = total_eth_received / n_tx
    t6_avg_deposit_size = (
        _weighted_points(weights["t6AvgDepositSize"], 1.0)
        if avg_deposit >= 5
        else _weighted_points(weights["t6AvgDepositSize"], 0.75)
        if avg_deposit >= 2
        else _weighted_points(weights["t6AvgDepositSize"], 0.5)
        if avg_deposit >= 0.5
        else _weighted_points(weights["t6AvgDepositSize"], 0.25)
        if avg_deposit >= 0.1
        else 0
    )

    recent_cutoff = now - 30 * 24 * 60 * 60
    recent_tx_count = sum(1 for tx in incoming_tx if float(tx.get("timestamp", 0)) >= recent_cutoff)
    t7_recent_activity = (
        _weighted_points(weights["t7RecentActivity"], 1.0)
        if recent_tx_count >= 50
        else _weighted_points(weights["t7RecentActivity"], 0.75)
        if recent_tx_count >= 20
        else _weighted_points(weights["t7RecentActivity"], 0.5)
        if recent_tx_count >= 8
        else _weighted_points(weights["t7RecentActivity"], 0.25)
        if recent_tx_count >= 3
        else 0
    )

    large_deposits = sum(1 for tx in incoming_tx if float(tx.get("value_eth", 0) or 0) >= 10)
    t8_large_deposit_count = (
        _weighted_points(weights["t8LargeDepositCount"], 1.0)
        if large_deposits >= 10
        else _weighted_points(weights["t8LargeDepositCount"], 0.75)
        if large_deposits >= 5
        else _weighted_points(weights["t8LargeDepositCount"], 0.5)
        if large_deposits >= 2
        else _weighted_points(weights["t8LargeDepositCount"], 0.25)
        if large_deposits >= 1
        else 0
    )

    t9_balance_strength = (
        _weighted_points(weights["t9BalanceStrength"], 1.0)
        if balance_eth >= 200
        else _weighted_points(weights["t9BalanceStrength"], 0.75)
        if balance_eth >= 75
        else _weighted_points(weights["t9BalanceStrength"], 0.5)
        if balance_eth >= 20
        else _weighted_points(weights["t9BalanceStrength"], 0.25)
        if balance_eth >= 5
        else 0
    )

    t10_risk_adjustment = _weighted_points(
        weights["t10RiskAdjustment"],
        1.0 if gambling_tx_count >= 10 else 0.5 if gambling_tx_count >= 3 else 0.0,
    )

    tier_points = [
        t1_wallet_wealth,
        gambling,
        volume,
        age,
        t5_unique_senders,
        t6_avg_deposit_size,
        t7_recent_activity,
        t8_large_deposit_count,
        t9_balance_strength,
        t10_risk_adjustment,
    ]
    return min(100, int(round(sum(tier_points))))


def compute_all_lens_scores(
    *,
    balance_eth: float,
    eth_price_usd: float,
    unique_senders: int,
    incoming_tx: List[Dict[str, Any]],
) -> List[Dict[str, Any]]:
    """One row per profile: profile id, label, emoji, total."""
    out: List[Dict[str, Any]] = []
    for key in ("casino", "risk", "marketing", "exchange", "defi"):
        prof: IndustryProfile = key  # type: ignore[assignment]
        meta = _INDUSTRY_PROFILES[prof]
        total = compute_whale_score_total(
            balance_eth=balance_eth,
            eth_price_usd=eth_price_usd,
            unique_senders=unique_senders,
            incoming_tx=incoming_tx,
            profile=prof,
        )
        out.append({"profile": prof, "label": meta["label"], "emoji": meta["emoji"], "total": total})
    return out
