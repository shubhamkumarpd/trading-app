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


def execute_paper_trade(proposal: dict, capital: float = 100_000) -> dict:
    """Open a simulated position for an approved proposal.

    No broker connection is used; the trade is written to the local trade log.
    """
    risk = proposal.get("risk")
    signal = proposal.get("signal", {})
    if signal.get("action") == "NO_TRADE":
        raise ValueError("Cannot execute a NO_TRADE proposal.")
    if not risk or not risk.get("approved"):
        reason = risk.get("reason", "missing risk decision") if risk else "missing risk decision"
        raise ValueError(f"Cannot execute an unapproved proposal: {reason}")

    engine = PaperTradingEngine(initial_capital=capital)
    return engine.open_trade(signal, quantity=risk["quantity"])
