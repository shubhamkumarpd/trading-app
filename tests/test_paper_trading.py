from app.trading.paper_trading import PaperTradingEngine

def test_open_sell_trade():
    engine = PaperTradingEngine(initial_capital=100000)

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


def test_close_sell_trade_with_profit():
    engine = PaperTradingEngine(initial_capital=100000)

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