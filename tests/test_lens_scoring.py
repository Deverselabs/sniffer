from app.services.lens_scoring import compute_all_lens_scores, compute_whale_score_total


def test_lens_scores_all_profiles():
    incoming = [
        {"from": "0x1111111111111111111111111111111111111111", "value_eth": 12.0, "timestamp": 1700000000},
        {"from": "0x2222222222222222222222222222222222222222", "value_eth": 8.0, "timestamp": 1700003600},
    ]
    rows = compute_all_lens_scores(
        balance_eth=50.0,
        eth_price_usd=3000.0,
        unique_senders=2,
        incoming_tx=incoming,
    )
    assert len(rows) == 5
    for row in rows:
        assert "profile" in row and "label" in row and "emoji" in row
        assert 0 <= row["total"] <= 100


def test_lens_score_matches_per_profile():
    incoming = [
        {"from": "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", "value_eth": 5.0, "timestamp": 1700000000},
    ]
    t_casino = compute_whale_score_total(
        balance_eth=10.0,
        eth_price_usd=2000.0,
        unique_senders=1,
        incoming_tx=incoming,
        profile="casino",
    )
    t_risk = compute_whale_score_total(
        balance_eth=10.0,
        eth_price_usd=2000.0,
        unique_senders=1,
        incoming_tx=incoming,
        profile="risk",
    )
    assert isinstance(t_casino, int)
    assert isinstance(t_risk, int)
