from dataclasses import dataclass
from typing import Dict, List


@dataclass(frozen=True)
class TierConfig:
    id: str
    label: str
    weight: int


TIER_CONFIG: List[TierConfig] = [
    TierConfig("t1_wallet_wealth", "T1 Wallet Wealth", 15),
    TierConfig("t2_gambling_signal", "T2 Gambling Signal", 15),
    TierConfig("t3_transaction_volume", "T3 Transaction Volume", 10),
    TierConfig("t4_wallet_age", "T4 Wallet Age", 10),
    TierConfig("t5_unique_senders", "T5 Unique Senders", 10),
    TierConfig("t6_avg_ticket_size", "T6 Average Ticket Size", 10),
    TierConfig("t7_recent_activity", "T7 Recent Activity", 10),
    TierConfig("t8_large_deposit_count", "T8 Large Deposit Count", 8),
    TierConfig("t9_balance_strength", "T9 Balance Strength", 7),
    TierConfig("t10_risk_penalty", "T10 Risk Adjustment", 5),
]


def tier_weights() -> Dict[str, int]:
    return {tier.id: tier.weight for tier in TIER_CONFIG}


GAMBLING_VOLUME_BANDS = [
    (75, 1.0),
    (30, 0.75),
    (10, 0.5),
    (1, 0.25),
]


TRANSACTION_VOLUME_BANDS_ETH = [
    (500, 1.0),
    (200, 0.85),
    (75, 0.65),
    (25, 0.45),
    (5, 0.25),
]
