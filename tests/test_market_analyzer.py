import pandas as pd

from app.analysis.market_analyzer import analyze_market


def create_market_data(condition="bullish"):
    rows = 60
    prices = [100 + i for i in range(rows)]

    df = pd.DataFrame({
        "close": prices,
        "ema_9": [120.0] * rows,
        "ema_21": [115.0] * rows,
        "ema_50": [110.0] * rows,
        "rsi_14": [60.0] * rows,
        "macd": [3.0] * rows,
        "macd_signal": [2.0] * rows,
        "atr_14": [2.0] * rows,
    })

    if condition == "bearish":
        df["ema_9"] = 90.0
        df["ema_21"] = 95.0
        df["ema_50"] = 100.0
        df["rsi_14"] = 40.0
        df["macd"] = -3.0
        df["macd_signal"] = -2.0

    return df


def test_bullish_market():
    result = analyze_market(create_market_data("bullish"))
    assert result["market_condition"] == "BULLISH"


def test_bearish_market():
    result = analyze_market(create_market_data("bearish"))
    assert result["market_condition"] == "BEARISH"


def test_insufficient_data():
    result = analyze_market(create_market_data().head(20))
    assert result["market_condition"] == "INSUFFICIENT_DATA"


def test_missing_indicators():
    df = create_market_data().drop(columns=["rsi_14"])

    try:
        analyze_market(df)
        assert False, "Expected ValueError"
    except ValueError as error:
        assert "rsi_14" in str(error)
