import pandas as pd
import pytest

from app.analysis.indicators import calculate_indicators


def create_test_data(rows=100):
    prices = [100 + i for i in range(rows)]

    return pd.DataFrame({
        "open": prices,
        "high": [p + 2 for p in prices],
        "low": [p - 2 for p in prices],
        "close": prices,
        "volume": [1000] * rows,
    })


def test_indicators_are_calculated():
    df = create_test_data()

    result = calculate_indicators(df)

    expected_columns = [
        "ema_9",
        "ema_21",
        "ema_50",
        "rsi_14",
        "macd",
        "macd_signal",
        "macd_histogram",
        "atr_14",
    ]

    for column in expected_columns:
        assert column in result.columns

    assert result["ema_9"].notna().any()
    assert result["rsi_14"].notna().any()
    assert result["atr_14"].notna().any()


def test_rsi_is_between_zero_and_100():
    result = calculate_indicators(create_test_data())

    valid_rsi = result["rsi_14"].dropna()

    assert not valid_rsi.empty
    assert valid_rsi.between(0, 100).all()


def test_missing_columns_raise_error():
    df = pd.DataFrame({
        "close": [100, 101, 102]
    })

    with pytest.raises(ValueError, match="Missing required columns"):
        calculate_indicators(df)


def test_empty_data_raises_error():
    df = pd.DataFrame(
        columns=["open", "high", "low", "close", "volume"]
    )

    with pytest.raises(ValueError, match="Candle data is empty"):
        calculate_indicators(df)
