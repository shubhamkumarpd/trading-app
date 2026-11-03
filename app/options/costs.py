"""Transaction costs for buying and selling NSE index options.

Rates are approximate and meant to stop paper profits looking better than they
would be live.  Compare them with a real contract note before trusting the net
numbers; every rate can be overridden through :class:`ChargeModel`.
"""

from dataclasses import dataclass


@dataclass(frozen=True)
class ChargeModel:
    brokerage_per_order: float = 20.0   # flat cap per executed order
    brokerage_pct: float = 0.03         # or this % of turnover, whichever is lower
    stt_sell_pct: float = 0.15          # on sell premium, from 1 Apr 2026
    exchange_txn_pct: float = 0.0356    # NSE index options, approximate
    sebi_pct: float = 0.0001            # Rs 10 per crore
    stamp_buy_pct: float = 0.003        # buy side only
    gst_pct: float = 18.0               # on brokerage + exchange + SEBI fees


def _brokerage(turnover: float, model: ChargeModel) -> float:
    return min(model.brokerage_per_order, turnover * model.brokerage_pct / 100)


def round_trip_charges(
    entry_premium: float,
    exit_premium: float,
    quantity: int,
    model: ChargeModel = ChargeModel(),
) -> dict:
    """Total charges for buying then selling ``quantity`` option units."""
    if entry_premium <= 0 or exit_premium <= 0 or quantity <= 0:
        raise ValueError("Premiums and quantity must be positive.")

    buy_turnover = entry_premium * quantity
    sell_turnover = exit_premium * quantity

    brokerage = _brokerage(buy_turnover, model) + _brokerage(sell_turnover, model)
    stt = sell_turnover * model.stt_sell_pct / 100
    exchange = (buy_turnover + sell_turnover) * model.exchange_txn_pct / 100
    sebi = (buy_turnover + sell_turnover) * model.sebi_pct / 100
    stamp = buy_turnover * model.stamp_buy_pct / 100
    gst = (brokerage + exchange + sebi) * model.gst_pct / 100

    total = brokerage + stt + exchange + sebi + stamp + gst
    return {
        "brokerage": round(brokerage, 2),
        "stt": round(stt, 2),
        "exchange": round(exchange, 2),
        "sebi": round(sebi, 2),
        "stamp": round(stamp, 2),
        "gst": round(gst, 2),
        "total": round(total, 2),
    }


def charges_for_trade(trade: dict, exit_price: float, model: ChargeModel = ChargeModel()) -> float:
    """Charges for one logged paper trade closing at ``exit_price``."""
    return round_trip_charges(
        float(trade["entry_price"]), float(exit_price), int(trade["quantity"]), model
    )["total"]
