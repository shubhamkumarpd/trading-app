def validate_trade(
    signal: dict,
    capital: float = 100000,
    risk_percent: float = 1.0,
    daily_loss: float = 0,
    daily_loss_limit_percent: float = 2.0,
) -> dict:
    """
    Independently validate a proposed paper trade.
    Never executes an order.
    """

    action = signal.get("action")

    if action not in ("BUY", "SELL"):
        return {
            "approved": False,
            "reason": "No valid BUY or SELL proposal."
        }

    entry = signal.get("entry_price")
    stop = signal.get("stop_loss")
    target = signal.get("target")

    if not all(isinstance(x, (int, float)) for x in [entry, stop, target]):
        return {
            "approved": False,
            "reason": "Missing or invalid trade prices."
        }

    if capital <= 0 or entry <= 0:
        return {
            "approved": False,
            "reason": "Capital and entry price must be positive."
        }

    if not 0 < risk_percent <= 1:
        return {
            "approved": False,
            "reason": "Risk per trade must be between 0 and 1 percent."
        }

    if daily_loss < 0:
        return {
            "approved": False,
            "reason": "Daily loss must be zero or a positive amount."
        }

    if daily_loss_limit_percent <= 0:
        return {
            "approved": False,
            "reason": "Daily loss limit must be positive."
        }

    # Validate trade direction
    if action == "BUY" and not stop < entry < target:
        return {
            "approved": False,
            "reason": "Invalid BUY price structure."
        }

    if action == "SELL" and not target < entry < stop:
        return {
            "approved": False,
            "reason": "Invalid SELL price structure."
        }

    # Daily loss protection
    daily_limit = capital * daily_loss_limit_percent / 100

    if daily_loss >= daily_limit:
        return {
            "approved": False,
            "reason": "Daily loss limit reached."
        }

    # Position sizing
    risk_amount = capital * risk_percent / 100
    risk_per_unit = abs(entry - stop)

    quantity = int(risk_amount // risk_per_unit)

    if quantity < 1:
        return {
            "approved": False,
            "reason": "Insufficient risk budget for one unit."
        }

    # Capital exposure check
    quantity = min(quantity, int(capital // entry))

    if quantity < 1:
        return {
            "approved": False,
            "reason": "Insufficient capital for one unit."
        }

    actual_risk = quantity * risk_per_unit

    return {
        "approved": True,
        "reason": "Trade passed initial risk checks.",
        "quantity": quantity,
        "risk_amount": round(actual_risk, 2),
        "capital_required": round(quantity * entry, 2),
        "risk_reward_ratio": round(
            abs(target - entry) / risk_per_unit, 2
        ),
    }
