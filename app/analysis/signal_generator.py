def generate_signal(market_analysis: dict) -> dict:
    """
    Generate a basic trade proposal from market analysis.
    No real orders are placed.
    """

    condition = market_analysis.get("market_condition")

    close = market_analysis.get("close")
    atr = market_analysis.get("atr")
    confidence = market_analysis.get("confidence", 0)

    # Default decision
    if condition not in ("BULLISH", "BEARISH"):
        return {
            "action": "NO_TRADE",
            "reason": "Market direction is unclear."
        }

    if close is None or atr is None or close <= 0 or atr <= 0:
        return {
            "action": "NO_TRADE",
            "reason": "Invalid price or volatility data."
        }

    if confidence < 75:
        return {
            "action": "NO_TRADE",
            "reason": "Market analysis confidence is below 75%."
        }

    # Initial stop-loss and target distances
    stop_distance = 1.5 * atr
    target_distance = 3.0 * atr

    if condition == "BULLISH":
        return {
            "action": "BUY",
            "entry_price": close,
            "stop_loss": round(close - stop_distance, 2),
            "target": round(close + target_distance, 2),
            "risk_reward_ratio": 2.0,
            "reason": "Bullish market conditions with sufficient confidence."
        }

    return {
        "action": "SELL",
        "entry_price": close,
        "stop_loss": round(close + stop_distance, 2),
        "target": round(close - target_distance, 2),
        "risk_reward_ratio": 2.0,
        "reason": "Bearish market conditions with sufficient confidence."
    }
