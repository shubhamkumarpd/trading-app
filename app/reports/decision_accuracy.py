"""How often the index call was right, measured from the decision log.

For every logged cycle the NIFTY close at the cycle's candle is compared with
the close ``horizon`` candles later.  BULLISH/BEARISH calls count as right when
the index moved in that direction.  SIDEWAYS (no call) rows only report how far
the index moved, which shows whether staying out avoided or missed a big move.
"""

import pandas as pd

DEFAULT_HORIZONS = (3, 6, 12)  # 15, 30 and 60 minutes on 5-minute candles


def evaluate_decisions(decisions, candles: pd.DataFrame, horizons=DEFAULT_HORIZONS) -> dict:
    frame = candles.copy()
    frame["_ts"] = pd.to_datetime(frame["timestamp"], utc=True)
    frame = frame.sort_values("_ts").reset_index(drop=True)
    index_of = {ts: i for i, ts in enumerate(frame["_ts"])}

    stats = {}
    for row in decisions:
        condition = row.get("market_condition")
        if condition not in ("BULLISH", "BEARISH", "SIDEWAYS"):
            continue
        try:
            position = index_of.get(pd.Timestamp(row["candle_time"]).tz_convert("UTC"))
        except (TypeError, ValueError, KeyError):
            continue
        if position is None:
            continue

        start = float(frame.loc[position, "close"])
        for horizon in horizons:
            if position + horizon >= len(frame):
                continue
            move_pct = (float(frame.loc[position + horizon, "close"]) - start) / start * 100
            bucket = stats.setdefault((condition, horizon), {"moves": [], "hits": 0})
            bucket["moves"].append(move_pct)
            if condition == "BULLISH" and move_pct > 0:
                bucket["hits"] += 1
            elif condition == "BEARISH" and move_pct < 0:
                bucket["hits"] += 1

    report = {}
    for (condition, horizon), bucket in sorted(stats.items()):
        moves = bucket["moves"]
        entry = {
            "calls": len(moves),
            "avg_move_pct": round(sum(moves) / len(moves), 3),
            "avg_abs_move_pct": round(sum(abs(m) for m in moves) / len(moves), 3),
        }
        if condition != "SIDEWAYS":
            entry["hit_rate_pct"] = round(bucket["hits"] / len(moves) * 100, 1)
        report[f"{condition}_{horizon}c"] = entry
    return report
