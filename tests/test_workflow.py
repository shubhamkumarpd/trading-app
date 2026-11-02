import pandas as pd
import pytest

from app.workflow import create_paper_trade_proposal, load_candles


def _candles(rows=60):
    prices = [100 + index for index in range(rows)]
    return pd.DataFrame({
        "timestamp": pd.date_range("2026-01-01", periods=rows, freq="5min"),
        "symbol": ["NSE:TEST-EQ"] * rows,
        "open": prices,
        "high": [price + 2 for price in prices],
        "low": [price - 2 for price in prices],
        "close": prices,
        "volume": [100] * rows,
    })


def test_workflow_creates_approved_buy_proposal():
    proposal = create_paper_trade_proposal(_candles())

    assert proposal["analysis"]["market_condition"] == "BULLISH"
    assert proposal["signal"]["action"] == "BUY"
    assert proposal["signal"]["entry_price"] == 159.0
    assert proposal["risk"]["approved"] is True


def test_load_candles_requires_symbol_for_multiple_instruments(tmp_path):
    candles = _candles(2)
    other = candles.copy()
    other["symbol"] = "NSE:OTHER-EQ"
    input_file = tmp_path / "candles.csv"
    pd.concat([candles, other]).to_csv(input_file, index=False)

    with pytest.raises(ValueError, match="multiple symbols"):
        load_candles(input_file)

    loaded = load_candles(input_file, "NSE:TEST-EQ")
    assert len(loaded) == 2
