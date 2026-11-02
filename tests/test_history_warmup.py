from datetime import datetime
from zoneinfo import ZoneInfo

import pandas as pd
import pytest

from app.data.fyers_client import fetch_history_candles, history_to_frame
from app.workflow import create_paper_trade_proposal, merge_history

IST = ZoneInfo("Asia/Kolkata")


def _response(start, rows, step_minutes=5):
    base = int(start.timestamp())
    candles = [
        [base + index * step_minutes * 60, 100 + index, 102 + index, 98 + index, 101 + index, 0]
        for index in range(rows)
    ]
    return {"s": "ok", "candles": candles}


class FakeClient:
    def __init__(self, response):
        self.response = response
        self.calls = []

    def history(self, data):
        self.calls.append(data)
        return self.response


def test_history_to_frame_drops_the_forming_candle():
    start = datetime(2026, 11, 2, 9, 15, tzinfo=IST)
    now = datetime(2026, 11, 2, 9, 32, tzinfo=IST)  # 9:30 candle is still forming

    frame = history_to_frame(_response(start, 4), "NSE:NIFTY50-INDEX", 5, now=now)

    assert len(frame) == 3
    assert frame["timestamp"].iloc[-1].hour == 9 and frame["timestamp"].iloc[-1].minute == 25
    assert (frame["symbol"] == "NSE:NIFTY50-INDEX").all()


def test_history_to_frame_rejects_failed_response():
    with pytest.raises(RuntimeError):
        history_to_frame({"s": "error", "message": "token expired"}, "X", 5)


def test_fetch_history_is_cached_for_the_day(tmp_path):
    start = datetime(2026, 10, 30, 9, 15, tzinfo=IST)
    now = datetime(2026, 11, 2, 9, 20, tzinfo=IST)
    client = FakeClient(_response(start, 10))

    first = fetch_history_candles(
        "NSE:NIFTY50-INDEX", 5, 10, client=client, cache_dir=tmp_path, now=now
    )
    second = fetch_history_candles(
        "NSE:NIFTY50-INDEX", 5, 10, client=client, cache_dir=tmp_path, now=now
    )

    assert len(client.calls) == 1
    assert client.calls[0]["range_from"] == "2026-10-23"
    assert client.calls[0]["range_to"] == "2026-11-02"
    assert len(first) == len(second) == 10
    assert str(second["timestamp"].dt.tz) == "UTC"


def _live(rows, start="2026-11-02 09:15:00+05:30"):
    prices = [200 + index for index in range(rows)]
    return pd.DataFrame({
        "timestamp": pd.date_range(start, periods=rows, freq="5min"),
        "symbol": ["NSE:NIFTY50-INDEX"] * rows,
        "open": prices,
        "high": [price + 2 for price in prices],
        "low": [price - 2 for price in prices],
        "close": prices,
        "volume": [0] * rows,
    })


def _history(rows):
    prices = [100 + index for index in range(rows)]
    return pd.DataFrame({
        "timestamp": pd.date_range("2026-10-30 09:15:00+05:30", periods=rows, freq="5min"),
        "symbol": ["NSE:NIFTY50-INDEX"] * rows,
        "open": prices,
        "high": [price + 2 for price in prices],
        "low": [price - 2 for price in prices],
        "close": prices,
        "volume": [0] * rows,
    })


def test_merge_history_prepends_only_earlier_candles():
    live = _live(5)
    history = pd.concat([_history(40), _live(3)], ignore_index=True)  # 3 overlap with live

    merged = merge_history(live, history)

    assert len(merged) == 45
    assert merged["timestamp"].is_monotonic_increasing
    assert merged["timestamp"].is_unique


def test_merge_history_without_history_returns_live_candles():
    live = _live(5)

    assert merge_history(live, None) is live
    assert merge_history(live, pd.DataFrame()) is live


def test_warm_up_removes_the_insufficient_data_window():
    live = _live(10)

    cold = create_paper_trade_proposal(live)
    warm = create_paper_trade_proposal(merge_history(live, _history(50)))

    assert cold["analysis"]["market_condition"] == "INSUFFICIENT_DATA"
    assert warm["analysis"]["market_condition"] != "INSUFFICIENT_DATA"
