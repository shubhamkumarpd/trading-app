from app.analysis.signal_generator import generate_signal


def test_bullish_generates_buy():
    analysis = {
        "market_condition": "BULLISH",
        "close": 1000,
        "atr": 10,
        "confidence": 100,
    }

    result = generate_signal(analysis)

    assert result["action"] == "BUY"
    assert result["stop_loss"] == 985
    assert result["target"] == 1030


def test_bearish_generates_sell():
    analysis = {
        "market_condition": "BEARISH",
        "close": 1000,
        "atr": 10,
        "confidence": 100,
    }

    result = generate_signal(analysis)

    assert result["action"] == "SELL"
    assert result["stop_loss"] == 1015
    assert result["target"] == 970


def test_sideways_generates_no_trade():
    analysis = {
        "market_condition": "SIDEWAYS",
        "close": 1000,
        "atr": 10,
        "confidence": 50,
    }

    result = generate_signal(analysis)

    assert result["action"] == "NO_TRADE"


def test_low_confidence_generates_no_trade():
    analysis = {
        "market_condition": "BULLISH",
        "close": 1000,
        "atr": 10,
        "confidence": 50,
    }

    result = generate_signal(analysis)

    assert result["action"] == "NO_TRADE"


def test_invalid_price_generates_no_trade():
    analysis = {
        "market_condition": "BULLISH",
        "close": 0,
        "atr": 10,
        "confidence": 100,
    }

    result = generate_signal(analysis)

    assert result["action"] == "NO_TRADE"
