import pandas as pd


def analyze_market(df: pd.DataFrame) -> dict:
    """
    Classify market conditions using technical indicators.
    """

    if df.empty or len(df) < 50:
        return {
            "market_condition": "INSUFFICIENT_DATA",
            "confidence": 0,
            "reasons": ["At least 50 candles are required."]
        }

    required = [
        "close",
        "ema_9",
        "ema_21",
        "ema_50",
        "rsi_14",
        "macd",
        "macd_signal",
        "atr_14",
    ]

    missing = [column for column in required if column not in df.columns]

    if missing:
        raise ValueError(f"Missing indicator columns: {missing}")

    latest = df.iloc[-1]

    if latest[required].isna().any():
        return {
            "market_condition": "INSUFFICIENT_DATA",
            "confidence": 0,
            "reasons": ["Latest candle has incomplete indicator values."]
        }

    bullish_score = 0
    bearish_score = 0
    reasons = []

    # EMA trend
    if latest["ema_9"] > latest["ema_21"] > latest["ema_50"]:
        bullish_score += 2
        reasons.append("EMA alignment indicates an upward trend.")

    elif latest["ema_9"] < latest["ema_21"] < latest["ema_50"]:
        bearish_score += 2
        reasons.append("EMA alignment indicates a downward trend.")

    else:
        reasons.append("EMA alignment is mixed.")

    # RSI
    if 55 <= latest["rsi_14"] <= 70:
        bullish_score += 1
        reasons.append("RSI supports bullish momentum.")

    elif 30 <= latest["rsi_14"] <= 45:
        bearish_score += 1
        reasons.append("RSI supports bearish momentum.")

    else:
        reasons.append("RSI does not provide a clear directional signal.")

    # MACD
    if latest["macd"] > latest["macd_signal"]:
        bullish_score += 1
        reasons.append("MACD is above its signal line.")

    elif latest["macd"] < latest["macd_signal"]:
        bearish_score += 1
        reasons.append("MACD is below its signal line.")

    # Final classification
    if bullish_score >= 3 and bullish_score > bearish_score:
        condition = "BULLISH"
        confidence = round(bullish_score / 4 * 100)

    elif bearish_score >= 3 and bearish_score > bullish_score:
        condition = "BEARISH"
        confidence = round(bearish_score / 4 * 100)

    else:
        condition = "SIDEWAYS"
        confidence = 0

    return {
        "market_condition": condition,
        "confidence": confidence,
        "bullish_score": bullish_score,
        "bearish_score": bearish_score,
        "close": float(latest["close"]),
        "rsi": float(latest["rsi_14"]),
        "atr": float(latest["atr_14"]),
        "reasons": reasons,
    }