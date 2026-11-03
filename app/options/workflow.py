"""One NIFTY weekly-option paper-trading cycle.

The index candles decide direction (existing analysis and signal code).  The
chosen option contract is then priced from a live option chain, sized on its
premium, and logged as a paper trade.  Every cycle, traded or not, is written
to the decision log.  No broker order is ever placed.
"""

from datetime import date, datetime, timedelta, timezone

import pandas as pd

from app.analysis.indicators import calculate_indicators
from app.analysis.market_analyzer import analyze_market
from app.analysis.signal_generator import generate_signal
from app.options.contracts import (
    ContractRejected,
    NIFTY_LOT_SIZE,
    UNDERLYING,
    next_weekly_expiry,
    select_contract,
)
from app.options.planner import plan_premium_trade


def _in_cooldown(engine, now: datetime, minutes: float) -> bool:
    """True when a stop-loss closed less than ``minutes`` ago."""
    if minutes <= 0:
        return False

    latest = None
    for trade in engine.closed_trades:
        if trade.get("exit_reason") != "STOP_LOSS" or not trade.get("closed_at"):
            continue
        closed_at = pd.Timestamp(trade["closed_at"])
        if closed_at.tzinfo is None:
            closed_at = closed_at.tz_localize("UTC")
        if latest is None or closed_at > latest:
            latest = closed_at

    if latest is None:
        return False
    return now.astimezone(timezone.utc) - latest.to_pydatetime() < timedelta(minutes=minutes)


def run_option_cycle(
    candles: pd.DataFrame,
    chain_loader,
    engine,
    decision_logger,
    now: datetime,
    capital: float = 100_000,
    risk_percent: float = 3.0,
    daily_loss_limit_percent: float = 5.0,
    sl_pct: float = 30.0,
    reward_multiple: float = 2.0,
    strike_offset: int = 0,
    max_spread_pct: float = 3.0,
    max_lots: int = 1,
    lot_size: int = NIFTY_LOT_SIZE,
    allow_expiry_day: bool = False,
    cooldown_minutes: float = 30.0,
    holidays=(),
    on_open=None,
) -> dict:
    """Analyse the index, and when warranted open one paper option trade.

    ``chain_loader`` is a callable returning ``(spot, chain_dataframe)`` so the
    cycle can be tested without FYERS.  ``on_open(symbol)`` is called after a
    trade opens (the CLI uses it to make the collector record that contract).
    """
    enriched = calculate_indicators(candles)
    analysis = analyze_market(enriched)
    signal = generate_signal(analysis)

    record = {
        "symbol": UNDERLYING,
        "candle_time": str(candles.iloc[-1]["timestamp"]),
        "index_close": analysis.get("close", ""),
        "market_condition": analysis.get("market_condition", ""),
        "confidence": analysis.get("confidence", ""),
        "bullish_score": analysis.get("bullish_score", ""),
        "bearish_score": analysis.get("bearish_score", ""),
        "rsi": analysis.get("rsi", ""),
        "atr": analysis.get("atr", ""),
        "signal_action": signal["action"],
        "signal_reason": signal.get("reason", ""),
    }

    def finish(outcome, reason="", **extra):
        record.update(outcome=outcome, outcome_reason=reason, **extra)
        decision_logger.log(record)
        return {"analysis": analysis, "signal": signal, "outcome": outcome, "reason": reason, **extra}

    if signal["action"] == "NO_TRADE":
        return finish("NO_TRADE", signal.get("reason", ""))

    if engine.open_positions:
        return finish("SKIPPED", "An option paper position is already open.")

    if _in_cooldown(engine, now, cooldown_minutes):
        return finish("SKIPPED", f"Cooling down for {cooldown_minutes:g} minutes after a stop-loss.")

    today: date = now.date()
    expiry = next_weekly_expiry(today, holidays)

    try:
        spot, chain = chain_loader()
    except Exception as error:  # chain is a live call; keep the cycle alive
        return finish("SKIPPED", f"Option chain unavailable: {error}")

    try:
        contract = select_contract(
            chain, spot, signal["action"], today, expiry,
            lot_size=lot_size, strike_offset=strike_offset, max_spread_pct=max_spread_pct,
        )
    except ContractRejected as error:
        return finish("REJECTED", str(error))

    quote = {
        "option_symbol": contract.symbol, "strike": contract.strike,
        "option_type": contract.option_type, "dte": contract.dte,
        "bid": contract.bid, "ask": contract.ask, "spread_pct": contract.spread_pct,
    }

    plan = plan_premium_trade(
        contract,
        capital=capital,
        risk_percent=risk_percent,
        daily_loss=engine.realised_loss(),
        daily_loss_limit_percent=daily_loss_limit_percent,
        sl_pct=sl_pct,
        reward_multiple=reward_multiple,
        max_lots=max_lots,
        allow_expiry_day=allow_expiry_day,
        now=now,
    )
    if not plan["approved"]:
        return finish("REJECTED", plan["reason"], **quote)

    # The buyer is always long the option, so the engine trade is a BUY on premium.
    trade = engine.open_trade(
        {
            "action": "BUY",
            "entry_price": plan["entry_price"],
            "stop_loss": plan["stop_loss"],
            "target": plan["target"],
            "symbol": contract.symbol,
        },
        quantity=plan["quantity"],
        extra={
            "underlying": UNDERLYING,
            "option_type": contract.option_type,
            "strike": contract.strike,
            "expiry": contract.expiry.isoformat(),
            "dte": contract.dte,
            "lot_size": contract.lot_size,
            "index_entry": analysis.get("close", ""),
            "spread_pct": contract.spread_pct,
            "signal_confidence": analysis.get("confidence", ""),
        },
    )

    if on_open:
        on_open(contract.symbol)

    return finish("OPENED", "Option paper trade opened.", trade_id=trade["trade_id"], **quote) | {
        "plan": plan,
        "paper_trade": trade,
    }
