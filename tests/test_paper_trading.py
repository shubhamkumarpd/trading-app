from app.trading.paper_trading import PaperTradingEngine
from app.trading.trade_logger import TradeLogger


def test_open_sell_trade(tmp_path):
    engine = PaperTradingEngine(
        initial_capital=100000, trade_logger=TradeLogger(log_dir=tmp_path)
    )

    signal = {
        "action": "SELL",
        "entry": 100,
        "stop_loss": 105,
        "target": 90,
    }

    trade = engine.open_trade(signal, quantity=10)

    assert trade["action"] == "SELL"
    assert trade["quantity"] == 10
    assert trade["status"] == "OPEN"


def test_close_sell_trade_with_profit(tmp_path):
    engine = PaperTradingEngine(
        initial_capital=100000, trade_logger=TradeLogger(log_dir=tmp_path)
    )

    signal = {
        "action": "SELL",
        "entry": 100,
        "stop_loss": 105,
        "target": 90,
    }

    trade = engine.open_trade(signal, quantity=10)

    closed_trade = engine.close_trade(
        trade["trade_id"],
        exit_price=90,
        reason="TARGET",
    )

    assert closed_trade["pnl"] == 100
