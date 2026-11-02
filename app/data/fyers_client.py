"""FYERS REST helpers used to warm up indicators with recent history.

The live collector only sees today's ticks, so EMA 50 needs 250 minutes of
five-minute candles before the first signal.  Seeding the analysis with the
previous sessions' candles removes that blind period.
"""

import os
import re
from datetime import datetime, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

import pandas as pd

IST = ZoneInfo("Asia/Kolkata")
HISTORY_COLUMNS = ["timestamp", "symbol", "open", "high", "low", "close", "volume"]


def create_client(token_path: str = "token.txt"):
    """Build a synchronous FYERS client from ``.env`` and ``token.txt``."""
    from dotenv import load_dotenv
    from fyers_apiv3 import fyersModel

    load_dotenv()
    app_id = os.getenv("FYERS_APP_ID")
    token_file = Path(token_path)

    if not app_id or not token_file.is_file():
        raise RuntimeError("FYERS_APP_ID or token.txt is missing; run auth.py first.")

    return fyersModel.FyersModel(
        client_id=app_id,
        token=token_file.read_text().strip(),
        is_async=False,
        log_path="",
    )


def history_to_frame(
    response: dict,
    symbol: str,
    timeframe_minutes: int,
    now: datetime | None = None,
) -> pd.DataFrame:
    """Convert a FYERS ``history`` response into completed candles only."""
    if response.get("s") != "ok":
        raise RuntimeError(f"FYERS history request failed: {response}")

    rows = response.get("candles") or []
    if not rows:
        raise ValueError("FYERS returned no historical candles.")

    frame = pd.DataFrame(
        rows, columns=["epoch", "open", "high", "low", "close", "volume"]
    )
    frame["timestamp"] = pd.to_datetime(
        frame["epoch"], unit="s", utc=True
    ).dt.tz_convert(IST)
    frame["symbol"] = symbol

    # The API can include the candle that is still forming; drop it.
    now = pd.Timestamp(now or datetime.now(IST))
    if now.tzinfo is None:
        now = now.tz_localize(IST)
    candle_end = frame["timestamp"] + pd.Timedelta(minutes=timeframe_minutes)
    frame = frame[candle_end <= now]

    return frame[HISTORY_COLUMNS].sort_values("timestamp").reset_index(drop=True)


def _slug(symbol: str) -> str:
    return re.sub(r"[^A-Za-z0-9]+", "_", symbol).strip("_")


def fetch_history_candles(
    symbol: str,
    timeframe_minutes: int = 5,
    days: int = 10,
    client=None,
    cache_dir: str | Path = "data/processed",
    now: datetime | None = None,
) -> pd.DataFrame:
    """Return recent completed candles, cached once per day.

    The day runner analyzes every five minutes, so the response is cached in
    ``data/processed`` to avoid calling the history API on every cycle.
    """
    if days <= 0:
        raise ValueError("days must be positive")
    if timeframe_minutes <= 0:
        raise ValueError("timeframe_minutes must be positive")

    now = now or datetime.now(IST)
    cache_file = (
        Path(cache_dir)
        / f"history_{_slug(symbol)}_{timeframe_minutes}m_{days}d_{now:%Y-%m-%d}.csv"
    )

    if cache_file.is_file():
        cached = pd.read_csv(cache_file)
        cached["timestamp"] = pd.to_datetime(cached["timestamp"], utc=True)
        return cached

    client = client or create_client()
    response = client.history(data={
        "symbol": symbol,
        "resolution": str(timeframe_minutes),
        "date_format": "1",
        "range_from": (now - timedelta(days=days)).strftime("%Y-%m-%d"),
        "range_to": now.strftime("%Y-%m-%d"),
        "cont_flag": "1",
    })

    frame = history_to_frame(response, symbol, timeframe_minutes, now=now)
    cache_file.parent.mkdir(parents=True, exist_ok=True)
    frame.to_csv(cache_file, index=False)
    return frame
