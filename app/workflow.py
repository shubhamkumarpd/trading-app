"""Offline paper-trading workflow.

This module deliberately has no broker-order code.  It turns an existing
candle CSV into a paper-trade proposal and only writes a simulated trade when
the caller explicitly asks it to do so.
"""

from pathlib import Path

import pandas as pd

from app.analysis.indicators import calculate_indicators
from app.analysis.market_analyzer import analyze_market
from app.analysis.signal_generator import generate_signal
from app.risk.risk_manager import validate_trade
from app.trading.paper_trading import PaperTradingEngine
from app.trading.trade_monitor import monitor_open_trades, square_off


def merge_history(candles: pd.DataFrame, history: pd.DataFrame | None) -> pd.DataFrame:
    """Prepend earlier candles so indicators are warm at the start of the day.

    Only history that ends before the first live candle is used.  Live candles
    are built from the collector's own ticks and always take precedence.
    Timestamps are normalised to UTC so naive and timezone-aware values mix.
    """
    if history is None or history.empty:
        return candles

    live = candles.copy()
    live["timestamp"] = pd.to_datetime(live["timestamp"], utc=True)

    past = history.copy()
    past["timestamp"] = pd.to_datetime(past["timestamp"], utc=True)
    past = past[past["timestamp"] < live["timestamp"].min()]

    if past.empty:
        return live

    merged = pd.concat([past, live], ignore_index=True)
    return merged.sort_values("timestamp").reset_index(drop=True)


def load_candles(path: str | Path, symbol: str | None = None) -> pd.DataFrame:
    """Load and validate a candle CSV produced by :class:`CandleBuilder`."""
    input_path = Path(path)
    if not input_path.is_file():
        raise FileNotFoundError(input_path)

    candles = pd.read_csv(input_path)
    required = {"timestamp", "symbol", "open", "high", "low", "close"}
    missing = required - set(candles.columns)
    if missing:
        raise ValueError(f"Candle file is missing columns: {sorted(missing)}")

    if symbol is not None:
        candles = candles[candles["symbol"] == symbol].copy()
    elif candles["symbol"].nunique() > 1:
        raise ValueError("Candle file contains multiple symbols; pass --symbol.")

    if candles.empty:
        raise ValueError("No candles found for the selected symbol.")

    candles["timestamp"] = pd.to_datetime(candles["timestamp"], errors="coerce")
    candles = candles.dropna(subset=["timestamp"]).sort_values("timestamp")
    # Historical files created before volume support are still analyzable.
    if "volume" not in candles.columns:
        candles["volume"] = 0

    return candles.reset_index(drop=True)


def create_paper_trade_proposal(
    candles: pd.DataFrame,
    capital: float = 100_000,
    risk_percent: float = 1.0,
    daily_loss: float = 0.0,
) -> dict:
    """Return analysis, signal, and risk decision for one symbol's candles."""
    enriched = calculate_indicators(candles)
    analysis = analyze_market(enriched)
    signal = generate_signal(analysis)

    if signal["action"] == "NO_TRADE":
        return {"analysis": analysis, "signal": signal, "risk": None}

    signal["symbol"] = str(candles.iloc[-1]["symbol"])
    risk = validate_trade(
        signal,
        capital=capital,
        risk_percent=risk_percent,
        daily_loss=daily_loss,
    )
    return {"analysis": analysis, "signal": signal, "risk": risk}


def execute_paper_trade(
    proposal: dict,
    capital: float = 100_000,
    trade_logger=None,
) -> dict:
    """Open a simulated position for an approved proposal.

    No broker connection is used; the trade is written to the local trade log.
    The engine is rebuilt from today's log, so cash and open positions carry
    over between runs and a symbol cannot be opened twice.
    """
    risk = proposal.get("risk")
    signal = proposal.get("signal", {})
    if signal.get("action") == "NO_TRADE":
        raise ValueError("Cannot execute a NO_TRADE proposal.")
    if not risk or not risk.get("approved"):
        reason = risk.get("reason", "missing risk decision") if risk else "missing risk decision"
        raise ValueError(f"Cannot execute an unapproved proposal: {reason}")

    engine = PaperTradingEngine.from_log(capital, trade_logger=trade_logger)

    symbol = signal.get("symbol")
    if any(trade.get("symbol") == symbol for trade in engine.open_positions):
        raise ValueError(f"An open paper position already exists for {symbol}.")

    return engine.open_trade(signal, quantity=risk["quantity"])


def current_daily_loss(capital: float = 100_000, trade_logger=None) -> float:
    """Net realised loss so far today, read from the paper-trade log."""
    engine = PaperTradingEngine.from_log(capital, trade_logger=trade_logger)
    return engine.realised_loss()


def monitor_paper_trades(
    candles: pd.DataFrame,
    symbol: str,
    capital: float = 100_000,
    trade_logger=None,
) -> list[dict]:
    """Close today's open paper trades for ``symbol`` that hit stop or target."""
    engine = PaperTradingEngine.from_log(capital, trade_logger=trade_logger)
    return monitor_open_trades(engine, candles, symbol)


def square_off_paper_trades(
    candles: pd.DataFrame,
    symbol: str,
    capital: float = 100_000,
    trade_logger=None,
) -> list[dict]:
    """Close today's open paper trades at the latest candle close (end of day)."""
    engine = PaperTradingEngine.from_log(capital, trade_logger=trade_logger)
    last_close = float(candles.iloc[-1]["close"])
    return square_off(engine, symbol, last_close, reason="EOD")
