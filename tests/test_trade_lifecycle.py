from argparse import Namespace
from pathlib import Path

import pandas as pd
import pytest

from app.trading.paper_trading import PaperTradingEngine
from app.trading.trade_logger import TradeLogger
from app.trading.trade_monitor import find_exit
from app.workflow import (
    current_daily_loss,
    execute_paper_trade,
    monitor_paper_trades,
    square_off_paper_trades,
)
from run_day import build_command

SYMBOL = "NSE:NIFTY50-INDEX"


def _signal(action="BUY"):
    if action == "BUY":
        return {"action": "BUY", "symbol": SYMBOL, "entry_price": 100, "stop_loss": 95, "target": 110}
    return {"action": "SELL", "symbol": SYMBOL, "entry_price": 100, "stop_loss": 105, "target": 90}


def _open(tmp_path, action="BUY", capital=100_000):
    logger = TradeLogger(log_dir=tmp_path)
    engine = PaperTradingEngine.from_log(capital, trade_logger=logger)
    trade = engine.open_trade(_signal(action), quantity=10)
    return logger, trade


def _candles(opened_at, rows):
    """Candles starting at ``opened_at``; each row is (open, high, low, close)."""
    start = pd.Timestamp(opened_at)
    return pd.DataFrame({
        "timestamp": [start + pd.Timedelta(minutes=5 * index) for index in range(len(rows))],
        "symbol": SYMBOL,
        "open": [row[0] for row in rows],
        "high": [row[1] for row in rows],
        "low": [row[2] for row in rows],
        "close": [row[3] for row in rows],
        "volume": 0,
    })


def test_buy_hits_target(tmp_path):
    _, trade = _open(tmp_path)
    candles = _candles(trade["opened_at"], [(100, 104, 99, 103), (103, 111, 102, 110)])

    assert find_exit(trade, candles) == (110, "TARGET")


def test_buy_hits_stop(tmp_path):
    _, trade = _open(tmp_path)
    candles = _candles(trade["opened_at"], [(100, 104, 94, 96)])

    assert find_exit(trade, candles) == (95, "STOP_LOSS")


def test_stop_wins_when_one_candle_touches_both_levels(tmp_path):
    _, trade = _open(tmp_path)
    candles = _candles(trade["opened_at"], [(100, 112, 93, 100)])

    assert find_exit(trade, candles) == (95, "STOP_LOSS")


def test_gap_through_the_stop_fills_at_the_open(tmp_path):
    _, trade = _open(tmp_path)
    candles = _candles(trade["opened_at"], [(90, 92, 88, 91)])

    assert find_exit(trade, candles) == (90, "STOP_LOSS")


def test_sell_hits_target_and_stop(tmp_path):
    _, trade = _open(tmp_path, action="SELL")

    target_hit = _candles(trade["opened_at"], [(100, 101, 89, 90)])
    stop_hit = _candles(trade["opened_at"], [(100, 106, 99, 105)])

    assert find_exit(trade, target_hit) == (90, "TARGET")
    assert find_exit(trade, stop_hit) == (105, "STOP_LOSS")


def test_candles_before_entry_are_ignored(tmp_path):
    _, trade = _open(tmp_path)
    opened = pd.Timestamp(trade["opened_at"])
    earlier = _candles(opened - pd.Timedelta(minutes=10), [(100, 120, 80, 100)])
    earlier = earlier[earlier["timestamp"] < opened]

    assert find_exit(trade, earlier) is None


def test_engine_state_is_restored_from_the_log(tmp_path):
    logger, trade = _open(tmp_path)
    engine = PaperTradingEngine.from_log(100_000, trade_logger=logger)
    engine.close_trade(trade["trade_id"], 95, reason="STOP_LOSS")  # loss of 50
    engine.open_trade(_signal("SELL"), quantity=10)

    restored = PaperTradingEngine.from_log(100_000, trade_logger=logger)

    assert len(restored.closed_trades) == 1
    assert len(restored.open_positions) == 1
    assert restored.open_positions[0]["quantity"] == 10
    assert restored.cash == pytest.approx(100_000 - 50 - 100 * 10)
    assert restored.realised_loss() == 50


def test_daily_loss_is_read_from_the_log(tmp_path):
    logger, trade = _open(tmp_path)
    PaperTradingEngine.from_log(100_000, trade_logger=logger).close_trade(
        trade["trade_id"], 95, reason="STOP_LOSS"
    )

    assert current_daily_loss(100_000, trade_logger=logger) == 50


def test_profit_does_not_count_as_loss(tmp_path):
    logger, trade = _open(tmp_path)
    PaperTradingEngine.from_log(100_000, trade_logger=logger).close_trade(
        trade["trade_id"], 110, reason="TARGET"
    )

    assert current_daily_loss(100_000, trade_logger=logger) == 0


def test_execute_paper_trade_refuses_a_second_position_for_the_symbol(tmp_path):
    logger = TradeLogger(log_dir=tmp_path)
    proposal = {
        "signal": _signal("BUY"),
        "risk": {"approved": True, "quantity": 5},
    }

    execute_paper_trade(proposal, 100_000, trade_logger=logger)

    with pytest.raises(ValueError, match="already exists"):
        execute_paper_trade(proposal, 100_000, trade_logger=logger)

    assert len(logger.get_all_trades()) == 1


def test_monitor_closes_and_logs_the_trade(tmp_path):
    logger, trade = _open(tmp_path)
    candles = _candles(trade["opened_at"], [(100, 111, 99, 110)])

    closed = monitor_paper_trades(candles, SYMBOL, 100_000, trade_logger=logger)

    assert [item["exit_reason"] for item in closed] == ["TARGET"]
    row = logger.get_all_trades()[0]
    assert row["status"] == "CLOSED"
    assert float(row["net_pnl"]) == 100

    # Nothing is left to close on the next cycle.
    assert monitor_paper_trades(candles, SYMBOL, 100_000, trade_logger=logger) == []


def test_square_off_closes_at_the_latest_close(tmp_path):
    logger, trade = _open(tmp_path)
    candles = _candles(trade["opened_at"], [(100, 104, 99, 102)])

    closed = square_off_paper_trades(candles, SYMBOL, 100_000, trade_logger=logger)

    assert closed[0]["exit_reason"] == "EOD"
    assert closed[0]["exit_price"] == 102
    assert logger.get_all_trades()[0]["status"] == "CLOSED"


def test_day_runner_opens_paper_trades_by_default():
    from run_day import cycle_flags

    assert cycle_flags(Namespace(no_auto_paper=False)) == ("--monitor", "--execute-paper")
    assert cycle_flags(Namespace(no_auto_paper=True)) == ("--monitor",)


def test_day_runner_passes_warm_up_and_mode_flags():
    args = Namespace(timeframe=5, capital=100_000, risk_percent=1.0, history_days=10)

    command = build_command(Path("data/raw/x.csv"), SYMBOL, args, ("--monitor",))

    assert command[command.index("--history-days") + 1] == "10"
    assert command[-1] == "--monitor"
