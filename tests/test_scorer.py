from datetime import datetime, timedelta, timezone

from app.services.scorer import gambling_score, score, volume_score


def _tx(value_eth: float, from_addr: str, to_addr: str, days_ago: int) -> dict:
    ts = int((datetime.now(tz=timezone.utc) - timedelta(days=days_ago)).timestamp())
    return {
        "from": from_addr,
        "to": to_addr,
        "value": str(int(value_eth * 1e18)),
        "timeStamp": str(ts),
    }


def test_volume_score_bands():
    txlist = [_tx(100, "0xaaa", "0xbbb", 5), _tx(150, "0xccc", "0xbbb", 3)]
    result = volume_score(txlist, 10)
    assert result["total_volume_eth"] == 250.0
    assert result["points"] >= 8


def test_gambling_score_v2_breakdown():
    gambling_contracts = ["0x1111111111111111111111111111111111111111"]
    txs = [
        _tx(2, "0x1111111111111111111111111111111111111111", "0xabc", 4),
        _tx(1, "0xabc", "0x1111111111111111111111111111111111111111", 7),
        _tx(3, "0x1111111111111111111111111111111111111111", "0xabc", 15),
    ]
    result = gambling_score(txs, gambling_contracts, 15)
    assert "platform_bonus" in result
    assert "frequency_90d_bonus" in result
    assert "recency_bonus" in result
    assert result["interaction_count"] == 3
    assert result["points"] > 0


def test_score_returns_10_tiers():
    wallet = "0xd8da6bf26964af9d7eed9e03e53415d37aa96045"
    txs = [
        _tx(12, "0x1111111111111111111111111111111111111111", wallet, 2),
        _tx(8, "0x2222222222222222222222222222222222222222", wallet, 10),
        _tx(4, "0x3333333333333333333333333333333333333333", wallet, 45),
        _tx(20, "0x4444444444444444444444444444444444444444", wallet, 90),
    ]
    result = score(
        wallet,
        txlist=txs,
        gambling_contracts=["0x1111111111111111111111111111111111111111"],
        balance_eth=95,
        eth_price_usd=3000,
    )
    assert len(result["tiers"]) == 10
    assert all("points" in tier and "max_points" in tier for tier in result["tiers"])
    assert isinstance(result["total"], int)
