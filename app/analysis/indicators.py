import pandas as pd


def calculate_indicators(df: pd.DataFrame) -> pd.DataFrame:
    """
    Calculate technical indicators from OHLCV candle data.

    Required columns:
    open, high, low, close, volume
    """

    required_columns = {"open", "high", "low", "close", "volume"}

    missing = required_columns - set(df.columns)

    if missing:
        raise ValueError(f"Missing required columns: {sorted(missing)}")

    if df.empty:
        raise ValueError("Candle data is empty")

    result = df.copy()

    for column in required_columns:
        result[column] = pd.to_numeric(result[column], errors="coerce")

    result = result.dropna(subset=["open", "high", "low", "close"])

    if (result["close"] <= 0).any():
        raise ValueError("Close prices must be positive")

    # Exponential moving averages
    result["ema_9"] = result["close"].ewm(
        span=9, adjust=False, min_periods=9
    ).mean()

    result["ema_21"] = result["close"].ewm(
        span=21, adjust=False, min_periods=21
    ).mean()

    result["ema_50"] = result["close"].ewm(
        span=50, adjust=False, min_periods=50
    ).mean()

    # RSI (14-period)
    price_change = result["close"].diff()

    gains = price_change.clip(lower=0)
    losses = -price_change.clip(upper=0)

    avg_gain = gains.ewm(
        alpha=1 / 14, adjust=False, min_periods=14
    ).mean()

    avg_loss = losses.ewm(
        alpha=1 / 14, adjust=False, min_periods=14
    ).mean()

    relative_strength = avg_gain / avg_loss

    result["rsi_14"] = 100 - (100 / (1 + relative_strength))

    result.loc[
        (avg_loss == 0) & (avg_gain > 0), "rsi_14"
    ] = 100

    result.loc[
        (avg_loss == 0) & (avg_gain == 0), "rsi_14"
    ] = 50

    # MACD (12, 26, 9)
    ema_12 = result["close"].ewm(
        span=12, adjust=False, min_periods=12
    ).mean()

    ema_26 = result["close"].ewm(
        span=26, adjust=False, min_periods=26
    ).mean()

    result["macd"] = ema_12 - ema_26

    result["macd_signal"] = result["macd"].ewm(
        span=9, adjust=False, min_periods=9
    ).mean()

    result["macd_histogram"] = (
        result["macd"] - result["macd_signal"]
    )

    # Average True Range (14)
    previous_close = result["close"].shift(1)

    true_range = pd.concat(
        [
            result["high"] - result["low"],
            (result["high"] - previous_close).abs(),
            (result["low"] - previous_close).abs(),
        ],
        axis=1,
    ).max(axis=1)

    result["atr_14"] = true_range.ewm(
        alpha=1 / 14, adjust=False, min_periods=14
    ).mean()

    return result
