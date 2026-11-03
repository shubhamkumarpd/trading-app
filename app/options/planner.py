"""Premium-based trade plan and risk check for a bought option.

A buyer can lose at most the premium paid, but a stop-loss on the premium is
still used so one trade cannot lose most of it.  The index signal only decides
direction; stop and target are set on the option premium itself.
"""

from datetime import datetime, time

from app.options.contracts import OptionContract

TICK = 0.05
MAX_RISK_PERCENT = 5.0


def _round_tick(price: float, tick: float = TICK) -> float:
    return round(round(price / tick) * tick, 2)


def plan_premium_trade(
    contract: OptionContract,
    capital: float = 100_000,
    risk_percent: float = 3.0,
    daily_loss: float = 0.0,
    daily_loss_limit_percent: float = 5.0,
    sl_pct: float = 30.0,
    reward_multiple: float = 2.0,
    max_lots: int = 1,
    allow_expiry_day: bool = False,
    now: datetime | None = None,
    entry_cutoff: time = time(14, 45),
) -> dict:
    """Return an approved or rejected plan; entry is at the ask (a buyer pays it).

    One lot can already risk 2-3% of a Rs 1 lakh account, so ``risk_percent``
    defaults to 3 instead of the 1% used for the index.  It is capped at 5.
    """
    if capital <= 0:
        return {"approved": False, "reason": "Capital must be positive."}
    if not 0 < risk_percent <= MAX_RISK_PERCENT:
        return {"approved": False, "reason": f"Risk per trade must be between 0 and {MAX_RISK_PERCENT} percent."}
    if not 0 < sl_pct < 100:
        return {"approved": False, "reason": "Stop-loss percent must be between 0 and 100."}
    if reward_multiple <= 0 or max_lots < 1 or daily_loss < 0:
        return {"approved": False, "reason": "Invalid reward multiple, max lots or daily loss."}

    if contract.dte == 0 and not allow_expiry_day:
        return {"approved": False, "reason": "Expiry day entries are switched off (use allow_expiry_day)."}
    if contract.dte < 0:
        return {"approved": False, "reason": "Contract expiry is in the past."}

    if now is not None and now.time() >= entry_cutoff:
        return {"approved": False, "reason": f"No new entries after {entry_cutoff:%H:%M}."}

    daily_limit = capital * daily_loss_limit_percent / 100
    if daily_loss >= daily_limit:
        return {"approved": False, "reason": "Daily loss limit reached."}

    entry = _round_tick(contract.ask)
    stop = _round_tick(entry * (1 - sl_pct / 100))
    target = _round_tick(entry * (1 + sl_pct / 100 * reward_multiple))
    if not stop < entry < target:
        return {"approved": False, "reason": "Premium too small for a valid stop and target."}

    risk_per_lot = (entry - stop) * contract.lot_size
    cost_per_lot = entry * contract.lot_size
    risk_budget = capital * risk_percent / 100

    lots = int(risk_budget // risk_per_lot)
    if lots < 1:
        return {
            "approved": False,
            "reason": (
                f"One lot risks Rs {risk_per_lot:.0f} but the budget is Rs {risk_budget:.0f}."
            ),
        }
    lots = min(lots, max_lots, int(capital // cost_per_lot))
    if lots < 1:
        return {"approved": False, "reason": "Insufficient capital for one lot."}

    quantity = lots * contract.lot_size
    return {
        "approved": True,
        "reason": "Trade passed option risk checks.",
        "symbol": contract.symbol,
        "entry_price": entry,
        "stop_loss": stop,
        "target": target,
        "lots": lots,
        "quantity": quantity,
        "risk_amount": round((entry - stop) * quantity, 2),
        "capital_required": round(entry * quantity, 2),
        "risk_reward_ratio": round((target - entry) / (entry - stop), 2),
    }
