from datetime import date, datetime, time, timezone
from zoneinfo import ZoneInfo

import pandas as pd
import pytest

from app.options.contracts import (
    ContractRejected,
    OptionContract,
    atm_strike,
    days_to_expiry,
    next_weekly_expiry,
    option_type_for,
    parse_option_chain,
    select_contract,
)
from app.options.costs import ChargeModel, charges_for_trade, round_trip_charges
from app.options.planner import plan_premium_trade
from app.options.workflow import run_option_cycle
from app.reports.decision_accuracy import evaluate_decisions
from app.reports.performance import TradePerformance
from app.trading.decision_logger import DecisionLogger
from app.trading.paper_trading import PaperTradingEngine
from app.trading.trade_logger import TradeLogger
from app.trading.trade_monitor import monitor_open_trades, square_off

IST = ZoneInfo("Asia/Kolkata")
NOW = datetime(2026, 11, 4, 11, 0, tzinfo=IST)  # Wednesday; next expiry Tue 10 Nov


def chain_response(spot=24012.0, ce_bid=119.0, ce_ask=120.0, pe_bid=99.0, pe_ask=100.0):
    return {
        "s": "ok",
        "code": 200,
        "data": {
            "optionsChain": [
                {"symbol": "NSE:NIFTY50-INDEX", "option_type": "", "strike_price": -1, "ltp": spot},
                {"symbol": "NSE:NIFTY2611024000CE", "option_type": "CE", "strike_price": 24000,
                 "bid": ce_bid, "ask": ce_ask, "ltp": 119.5},
                {"symbol": "NSE:NIFTY2611024000PE", "option_type": "PE", "strike_price": 24000,
                 "bid": pe_bid, "ask": pe_ask, "ltp": 99.5},
                {"symbol": "NSE:NIFTY2611024050CE", "option_type": "CE", "strike_price": 24050,
                 "bid": 90.0, "ask": 91.0, "ltp": 90.5},
            ]
        },
    }


def make_candles(kind="up", n=120, symbol="NSE:NIFTY50-INDEX", start=24000.0):
    stamps = pd.date_range("2026-11-04 09:15", periods=n, freq="5min", tz=IST)
    rows = []
    for i, ts in enumerate(stamps):
        if kind == "up":
            close = start + 3 * i + 0.05 * i * i
        else:
            close = start  # perfectly flat: no trend, RSI 50, MACD on its signal
        rows.append({
            "timestamp": ts.isoformat(), "symbol": symbol,
            "open": close - 1, "high": close + 4, "low": close - 4, "close": close, "volume": 1000,
        })
    return pd.DataFrame(rows)


@pytest.fixture
def loaders(tmp_path):
    return TradeLogger(log_dir=tmp_path / "trades"), DecisionLogger(log_dir=tmp_path / "decisions")


def cycle(candles, loaders, **kwargs):
    trade_logger, decision_logger = loaders
    engine = kwargs.pop("engine", None) or PaperTradingEngine(100_000, trade_logger=trade_logger)
    result = run_option_cycle(
        candles,
        chain_loader=lambda: parse_option_chain(chain_response()),
        engine=engine,
        decision_logger=decision_logger,
        now=kwargs.pop("now", NOW),
        **kwargs,
    )
    return result, engine


# ---- expiry calendar and strikes -------------------------------------------------

def test_weekly_expiry_is_tuesday():
    assert next_weekly_expiry(date(2026, 11, 3)) == date(2026, 11, 3)  # Tuesday itself
    assert next_weekly_expiry(date(2026, 11, 4)) == date(2026, 11, 10)  # Wednesday
    assert next_weekly_expiry(date(2026, 11, 7)) == date(2026, 11, 10)  # Saturday


def test_expiry_moves_to_previous_trading_day_on_holiday():
    assert next_weekly_expiry(date(2026, 11, 4), holidays=[date(2026, 11, 10)]) == date(2026, 11, 9)


def test_expiry_after_shifted_holiday_rolls_to_next_week():
    # Tuesday 10 Nov is a holiday, so expiry is Monday 9 Nov; from Tuesday onward it is next week's.
    assert next_weekly_expiry(date(2026, 11, 10), holidays=[date(2026, 11, 10)]) == date(2026, 11, 17)


def test_days_to_expiry_counts_calendar_days():
    assert days_to_expiry(date(2026, 11, 4), date(2026, 11, 10)) == 6


def test_atm_strike_rounds_to_nearest_step():
    assert atm_strike(24012) == 24000
    assert atm_strike(24026) == 24050
    assert atm_strike(24025) == 24050


def test_buyer_maps_direction_to_option_type():
    assert option_type_for("BUY") == "CE"
    assert option_type_for("SELL") == "PE"


# ---- chain parsing and contract selection ----------------------------------------

def test_select_contract_buys_atm_call_for_bullish_signal():
    spot, chain = parse_option_chain(chain_response())
    contract = select_contract(chain, spot, "BUY", date(2026, 11, 4), date(2026, 11, 10))
    assert (contract.symbol, contract.strike, contract.option_type) == ("NSE:NIFTY2611024000CE", 24000, "CE")
    assert contract.dte == 6 and contract.ask == 120.0


def test_select_contract_buys_put_for_bearish_signal():
    spot, chain = parse_option_chain(chain_response())
    contract = select_contract(chain, spot, "SELL", date(2026, 11, 4), date(2026, 11, 10))
    assert contract.option_type == "PE"


def test_itn_offset_moves_call_strike_down():
    spot, chain = parse_option_chain(chain_response(spot=24060))  # ATM is 24050
    contract = select_contract(chain, spot, "BUY", date(2026, 11, 4), date(2026, 11, 10), strike_offset=1)
    assert contract.strike == 24000


def test_wide_spread_is_rejected():
    spot, chain = parse_option_chain(chain_response(ce_bid=100, ce_ask=120))
    with pytest.raises(ContractRejected, match="spread"):
        select_contract(chain, spot, "BUY", date(2026, 11, 4), date(2026, 11, 10))


def test_one_sided_quote_is_rejected():
    spot, chain = parse_option_chain(chain_response(ce_bid=0, ce_ask=120))
    with pytest.raises(ContractRejected, match="two-sided"):
        select_contract(chain, spot, "BUY", date(2026, 11, 4), date(2026, 11, 10))


def test_missing_strike_is_rejected():
    spot, chain = parse_option_chain(chain_response(spot=24300))
    with pytest.raises(ContractRejected, match="No CE quote"):
        select_contract(chain, spot, "BUY", date(2026, 11, 4), date(2026, 11, 10))


def test_failed_chain_response_raises():
    with pytest.raises(RuntimeError):
        parse_option_chain({"s": "error", "code": 401})


# ---- costs ------------------------------------------------------------------------

def test_stt_applies_to_sell_side_only():
    model = ChargeModel(brokerage_per_order=0, exchange_txn_pct=0, sebi_pct=0, stamp_buy_pct=0)
    costs = round_trip_charges(100, 200, 65, model)
    assert costs["stt"] == round(200 * 65 * 0.15 / 100, 2)
    assert costs["total"] == costs["stt"]


def test_brokerage_is_capped_at_flat_fee_per_order():
    costs = round_trip_charges(100, 100, 65)  # turnover 6500: 0.03% = 1.95 < 20
    assert costs["brokerage"] == round(2 * 6500 * 0.03 / 100, 2)
    big = round_trip_charges(1000, 1000, 650)  # turnover 650000: flat 20 per order
    assert big["brokerage"] == 40.0


def test_charges_make_a_flat_trade_a_loss():
    trade = {"entry_price": 120.0, "quantity": 65}
    assert charges_for_trade(trade, 120.0) > 0


# ---- premium plan -----------------------------------------------------------------

def contract(**overrides):
    base = dict(symbol="NSE:NIFTY2611024000CE", strike=24000, option_type="CE",
                expiry=date(2026, 11, 10), dte=6, bid=119.0, ask=120.0, ltp=119.5,
                spread_pct=0.84, lot_size=65)
    base.update(overrides)
    return OptionContract(**base)


def test_plan_sets_premium_stop_and_target_and_one_lot():
    plan = plan_premium_trade(contract(), capital=100_000, risk_percent=3.0, now=NOW)
    assert plan["approved"]
    assert (plan["entry_price"], plan["stop_loss"], plan["target"]) == (120.0, 84.0, 192.0)
    assert plan["lots"] == 1 and plan["quantity"] == 65
    assert plan["risk_amount"] == 36.0 * 65
    assert plan["risk_reward_ratio"] == 2.0


def test_plan_rejects_when_one_lot_risks_more_than_budget():
    plan = plan_premium_trade(contract(), capital=100_000, risk_percent=1.0, now=NOW)
    assert not plan["approved"] and "budget" in plan["reason"]


def test_plan_rejects_expiry_day_unless_allowed():
    assert not plan_premium_trade(contract(dte=0), now=NOW)["approved"]
    assert plan_premium_trade(contract(dte=0), now=NOW, allow_expiry_day=True)["approved"]


def test_plan_rejects_late_entries():
    late = datetime(2026, 11, 4, 14, 50, tzinfo=IST)
    plan = plan_premium_trade(contract(), now=late)
    assert not plan["approved"] and "14:45" in plan["reason"]


def test_plan_rejects_after_daily_loss_limit():
    plan = plan_premium_trade(contract(), capital=100_000, daily_loss=5_000, now=NOW)
    assert not plan["approved"] and "Daily loss" in plan["reason"]


def test_plan_rejects_risk_percent_above_cap():
    assert not plan_premium_trade(contract(), risk_percent=6.0, now=NOW)["approved"]


# ---- full cycle -------------------------------------------------------------------

def test_bullish_cycle_opens_a_call_and_logs_decision(loaders):
    result, engine = cycle(make_candles("up"), loaders)

    assert result["outcome"] == "OPENED"
    trade = engine.open_positions[0]
    assert trade["symbol"] == "NSE:NIFTY2611024000CE"
    assert trade["action"] == "BUY" and trade["quantity"] == 65

    logged = loaders[0].get_all_trades()[0]
    assert logged["option_type"] == "CE" and logged["strike"] == "24000"
    assert logged["dte"] == "6" and logged["expiry"] == "2026-11-10"

    decision = loaders[1].read()[0]
    assert decision["outcome"] == "OPENED" and decision["market_condition"] == "BULLISH"
    assert decision["trade_id"] == trade["trade_id"]


def test_second_cycle_is_skipped_while_a_position_is_open(loaders):
    _, engine = cycle(make_candles("up"), loaders)
    result, _ = cycle(make_candles("up"), loaders, engine=engine)
    assert result["outcome"] == "SKIPPED" and "already open" in result["reason"]
    assert len(engine.open_positions) == 1


def test_sideways_cycle_is_logged_as_no_trade(loaders):
    result, engine = cycle(make_candles("flat"), loaders)
    assert result["outcome"] == "NO_TRADE"
    assert engine.open_positions == []
    assert loaders[1].read()[0]["outcome"] == "NO_TRADE"


def test_insufficient_history_is_logged_as_no_trade(loaders):
    result, _ = cycle(make_candles("up", n=20), loaders)
    assert result["outcome"] == "NO_TRADE"


def test_chain_failure_is_skipped_not_raised(loaders):
    trade_logger, decision_logger = loaders
    engine = PaperTradingEngine(100_000, trade_logger=trade_logger)

    def broken():
        raise RuntimeError("token expired")

    result = run_option_cycle(make_candles("up"), broken, engine, decision_logger, NOW)
    assert result["outcome"] == "SKIPPED" and "token expired" in result["reason"]


def test_rejected_contract_is_logged(loaders):
    trade_logger, decision_logger = loaders
    engine = PaperTradingEngine(100_000, trade_logger=trade_logger)
    result = run_option_cycle(
        make_candles("up"),
        lambda: parse_option_chain(chain_response(ce_bid=80, ce_ask=120)),
        engine, decision_logger, NOW,
    )
    assert result["outcome"] == "REJECTED"
    assert engine.open_positions == []


def test_cooldown_blocks_reentry_after_stop_loss(loaders):
    _, engine = cycle(make_candles("up"), loaders)
    trade = engine.open_positions[0]
    engine.close_trade(trade["trade_id"], 84.0, reason="STOP_LOSS", charges=10)

    result, _ = cycle(make_candles("up"), loaders, engine=engine, now=datetime.now(IST))
    assert result["outcome"] == "SKIPPED" and "Cooling down" in result["reason"]


def test_on_open_callback_receives_option_symbol(loaders):
    seen = []
    cycle(make_candles("up"), loaders, on_open=seen.append)
    assert seen == ["NSE:NIFTY2611024000CE"]


# ---- monitoring options with their own costs ---------------------------------------

def open_option_trade(loaders):
    _, engine = cycle(make_candles("up"), loaders)
    trade = engine.open_positions[0]
    trade["opened_at"] = "2026-11-04T05:30:00+00:00"  # before the candles below
    return engine, trade


def option_candles(symbol, highs_lows):
    rows = []
    for i, (high, low) in enumerate(highs_lows):
        ts = pd.Timestamp("2026-11-04 11:05", tz=IST) + pd.Timedelta(minutes=5 * i)
        rows.append({"timestamp": ts.isoformat(), "symbol": symbol, "open": 120, "high": high,
                     "low": low, "close": 120, "volume": 0})
    return pd.DataFrame(rows)


def test_target_hit_closes_with_charges_and_slippage(loaders):
    engine, trade = open_option_trade(loaders)
    candles = option_candles(trade["symbol"], [(125, 118), (195, 119)])

    closed = monitor_open_trades(
        engine, candles, trade["symbol"],
        charges=charges_for_trade, exit_adjust=lambda price, reason: price - 1.0,
    )

    assert closed[0]["exit_reason"] == "TARGET"
    assert closed[0]["exit_price"] == 191.0  # target 192 less 1.0 slippage
    assert closed[0]["charges"] > 0
    assert closed[0]["net_pnl"] == round((191.0 - 120.0) * 65 - closed[0]["charges"], 2)


def test_stop_hit_closes_at_a_loss(loaders):
    engine, trade = open_option_trade(loaders)
    closed = monitor_open_trades(
        engine, option_candles(trade["symbol"], [(125, 80)]), trade["symbol"], charges=charges_for_trade
    )
    assert closed[0]["exit_reason"] == "STOP_LOSS" and closed[0]["net_pnl"] < 0


def test_square_off_closes_open_option_trade(loaders):
    engine, trade = open_option_trade(loaders)
    closed = square_off(engine, trade["symbol"], 130.0, charges=charges_for_trade)
    assert closed[0]["exit_reason"] == "EOD" and engine.open_positions == []


def test_monitor_without_charges_still_works_for_index_trades(tmp_path):
    engine = PaperTradingEngine(100_000, trade_logger=TradeLogger(log_dir=tmp_path))
    trade = engine.open_trade(
        {"action": "BUY", "entry_price": 100, "stop_loss": 95, "target": 110, "symbol": "X"}, 10
    )
    trade["opened_at"] = "2026-11-04T05:30:00+00:00"
    candles = pd.DataFrame([{
        "timestamp": "2026-11-04T06:00:00+00:00", "symbol": "X",
        "open": 100, "high": 111, "low": 99, "close": 110, "volume": 0,
    }])
    closed = monitor_open_trades(engine, candles, "X")
    assert closed[0]["exit_reason"] == "TARGET" and closed[0]["charges"] == 0


# ---- logs and reports -------------------------------------------------------------

def test_old_trade_log_header_is_migrated(tmp_path):
    day = datetime.now().astimezone().strftime("%Y-%m-%d")
    old_header = "trade_id,symbol,action,quantity,entry_price,stop_loss,target,opened_at,exit_price,closed_at,exit_reason,gross_pnl,charges,net_pnl,status"
    (tmp_path / f"trade_history_{day}.csv").write_text(
        old_header + "\nold-1,NSE:NIFTY50-INDEX,BUY,10,100,95,110,2026-11-04T05:30:00+00:00,,,,,,,OPEN\n"
    )

    logger = TradeLogger(log_dir=tmp_path)
    engine = PaperTradingEngine(100_000, trade_logger=logger)
    engine.open_trade(
        {"action": "BUY", "entry_price": 120, "stop_loss": 84, "target": 192, "symbol": "OPT"},
        65, extra={"option_type": "CE", "strike": 24000},
    )

    rows = logger.get_all_trades()
    assert [r["trade_id"] for r in rows][0] == "old-1"
    assert rows[1]["option_type"] == "CE" and rows[1]["strike"] == "24000"
    assert rows[0]["option_type"] == ""


def test_performance_reports_expectancy_and_drawdown():
    trades = [
        {"status": "CLOSED", "net_pnl": 300, "gross_pnl": 320},
        {"status": "CLOSED", "net_pnl": -100, "gross_pnl": -80},
        {"status": "CLOSED", "net_pnl": -200, "gross_pnl": -180},
    ]
    report = TradePerformance(trades).generate_report()
    assert report["expectancy"] == 0.0
    assert report["avg_win"] == 300 and report["avg_loss"] == 150
    assert report["max_drawdown"] == 300


def test_decision_accuracy_scores_direction_calls():
    candles = make_candles("up", n=30)
    decisions = [
        {"market_condition": "BULLISH", "candle_time": candles.iloc[5]["timestamp"]},
        {"market_condition": "BEARISH", "candle_time": candles.iloc[8]["timestamp"]},
        {"market_condition": "SIDEWAYS", "candle_time": candles.iloc[10]["timestamp"]},
    ]
    report = evaluate_decisions(decisions, candles, horizons=(3,))
    assert report["BULLISH_3c"]["hit_rate_pct"] == 100.0
    assert report["BEARISH_3c"]["hit_rate_pct"] == 0.0
    assert "hit_rate_pct" not in report["SIDEWAYS_3c"]
