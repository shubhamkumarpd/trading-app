from app.risk.risk_manager import validate_trade


def valid_buy():
    return {
        "action": "BUY",
        "entry_price": 1000,
        "stop_loss": 990,
        "target": 1020,
    }


def test_valid_trade_is_approved():
    result = validate_trade(valid_buy())
    assert result["approved"] is True
    assert result["quantity"] == 100


def test_invalid_buy_stop_loss_is_rejected():
    signal = valid_buy()
    signal["stop_loss"] = 1010

    result = validate_trade(signal)
    assert result["approved"] is False


def test_daily_loss_limit_is_enforced():
    result = validate_trade(
        valid_buy(),
        capital=100000,
        daily_loss=2000,
    )

    assert result["approved"] is False


def test_no_trade_is_rejected():
    signal = {"action": "NO_TRADE"}

    result = validate_trade(signal)
    assert result["approved"] is False


def test_invalid_risk_percentage_is_rejected():
    result = validate_trade(
        valid_buy(),
        risk_percent=5,
    )

    assert result["approved"] is False
