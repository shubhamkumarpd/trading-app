"""Close open paper trades when price reaches their stop-loss or target.

Only candles that start at or after the trade was opened are examined.  The
candle that was still forming at entry time mixes pre-entry prices, so it is
skipped to avoid false stop-outs.  When one candle touches both levels the
stop-loss wins, which is the conservative assumption.
"""

import pandas as pd


def find_exit(trade, candles):
    """Return ``(exit_price, reason)`` for the first level hit, else ``None``."""
    opened_at = pd.Timestamp(trade["opened_at"])
    if opened_at.tzinfo is None:
        opened_at = opened_at.tz_localize("UTC")

    frame = candles.assign(_ts=pd.to_datetime(candles["timestamp"], utc=True))
    frame = frame[frame["_ts"] >= opened_at].sort_values("_ts")

    stop = float(trade["stop_loss"])
    target = float(trade["target"])
    is_buy = trade["action"] == "BUY"

    for candle in frame.itertuples():
        if is_buy:
            if candle.low <= stop:
                # A gap below the stop fills at the open, not at the stop.
                return min(stop, float(candle.open)), "STOP_LOSS"
            if candle.high >= target:
                return target, "TARGET"
        else:
            if candle.high >= stop:
                return max(stop, float(candle.open)), "STOP_LOSS"
            if candle.low <= target:
                return target, "TARGET"

    return None


def monitor_open_trades(engine, candles, symbol, charges=0):
    """Close every open trade for ``symbol`` that hit its stop or target."""
    closed = []

    for trade in list(engine.open_positions):
        if trade.get("symbol") != symbol:
            continue

        result = find_exit(trade, candles)
        if result is None:
            continue

        exit_price, reason = result
        closed.append(
            engine.close_trade(
                trade["trade_id"], exit_price, reason=reason, charges=charges
            )
        )

    return closed


def square_off(engine, symbol, price, reason="EOD", charges=0):
    """Close every open trade for ``symbol`` at ``price`` (end of session)."""
    closed = []

    for trade in list(engine.open_positions):
        if trade.get("symbol") != symbol:
            continue

        closed.append(
            engine.close_trade(
                trade["trade_id"], price, reason=reason, charges=charges
            )
        )

    return closed
