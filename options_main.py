"""Run one NIFTY weekly-option paper-trading cycle.

Examples:
    python options_main.py --raw data/raw/market_data_2026-11-03.csv --monitor
    python options_main.py --raw data/raw/market_data_2026-11-03.csv --square-off
    python options_main.py --candles data/candles/candles_2026-11-03_5m.csv \
        --chain-file chain.json            # offline test with a saved chain

Each run: close option paper trades that hit their stop or target
(``--monitor``), analyse the NIFTY index candles, and, when the signal passes
every check, buy one paper option at the ask.  Every cycle goes to
``logs/decisions``.  There is no order-placing code anywhere in this project.
"""

import argparse
import json
import sys
from datetime import date, datetime
from pathlib import Path
from zoneinfo import ZoneInfo

from app.data.candle_builder import CandleBuilder
from app.options.contracts import NIFTY_LOT_SIZE, UNDERLYING, fetch_option_chain, parse_option_chain
from app.options.costs import charges_for_trade
from app.options.workflow import run_option_cycle
from app.trading.decision_logger import DecisionLogger
from app.trading.paper_trading import PaperTradingEngine
from app.trading.trade_logger import TradeLogger
from app.trading.trade_monitor import monitor_open_trades, square_off
from app.workflow import load_candles, merge_history

IST = ZoneInfo("Asia/Kolkata")
TICK = 0.05


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="NIFTY weekly option paper-trading cycle.")
    source = parser.add_mutually_exclusive_group(required=True)
    source.add_argument("--candles", help="Existing OHLC candle CSV (index and option symbols).")
    source.add_argument("--raw", help="Raw tick CSV to convert into candles first.")
    parser.add_argument("--symbol", default=UNDERLYING, help="Index symbol; only NIFTY 50 is supported.")
    parser.add_argument("--timeframe", type=int, default=5)
    parser.add_argument("--capital", type=float, default=100_000)
    parser.add_argument("--risk-percent", type=float, default=3.0, help="Max loss per trade as %% of capital (cap 5).")
    parser.add_argument("--daily-loss-limit", type=float, default=5.0, help="Stop trading for the day at this %% loss.")
    parser.add_argument("--sl-pct", type=float, default=30.0, help="Stop-loss as %% of the premium paid.")
    parser.add_argument("--reward-multiple", type=float, default=2.0, help="Target distance as a multiple of the stop distance.")
    parser.add_argument("--lot-size", type=int, default=NIFTY_LOT_SIZE)
    parser.add_argument("--max-lots", type=int, default=1)
    parser.add_argument("--strike-offset", type=int, default=0, help="ITM steps of 50 points (0 = at the money).")
    parser.add_argument("--max-spread-pct", type=float, default=3.0)
    parser.add_argument("--exit-slippage-pct", type=float, default=0.5, help="Haircut on exit fills (selling at the bid).")
    parser.add_argument("--cooldown-minutes", type=float, default=30.0)
    parser.add_argument("--allow-expiry-day", action="store_true", help="Allow entries on expiry day (off by default).")
    parser.add_argument("--holiday", action="append", default=[], help="NSE holiday YYYY-MM-DD; may repeat.")
    parser.add_argument("--history-days", type=int, default=0)
    parser.add_argument("--monitor", action="store_true", help="Close option trades that hit stop or target.")
    parser.add_argument("--square-off", action="store_true", help="Close all open option trades at the last price and exit.")
    parser.add_argument("--chain-file", help="Saved FYERS option-chain JSON (skips the live call).")
    return parser.parse_args()


def exit_adjuster(slippage_pct: float):
    def adjust(price: float, reason: str) -> float:
        slipped = price * (1 - slippage_pct / 100)
        return max(TICK, round(round(slipped / TICK) * TICK, 2))
    return adjust


def watchlist_path(day: date) -> Path:
    return Path("data") / f"watch_symbols_{day:%Y-%m-%d}.txt"


def add_to_watchlist(symbol: str, day: date) -> None:
    """Ask the collector to record this option's ticks so it can be monitored."""
    path = watchlist_path(day)
    path.parent.mkdir(parents=True, exist_ok=True)
    existing = path.read_text().split() if path.exists() else []
    if symbol not in existing:
        with path.open("a", encoding="utf-8") as file:
            file.write(symbol + "\n")


def candles_for(candle_path, symbol):
    try:
        return load_candles(candle_path, symbol)
    except ValueError:
        return None  # no ticks recorded for this contract yet


def make_chain_loader(args):
    def load():
        if args.chain_file:
            response = json.loads(Path(args.chain_file).read_text())
        else:
            from app.data.fyers_client import create_client
            response = fetch_option_chain(create_client())
        return parse_option_chain(response)
    return load


def main() -> int:
    args = parse_args()
    if args.symbol != UNDERLYING:
        print(f"Only {UNDERLYING} is supported for option trading.", file=sys.stderr)
        return 2

    now = datetime.now(IST)
    candle_path = Path(args.candles) if args.candles else None
    if args.raw:
        candle_path, count = CandleBuilder(args.timeframe).build_from_csv(args.raw)
        print(f"Built {count} completed candles: {candle_path}")

    index_candles = load_candles(candle_path, UNDERLYING)

    if args.history_days > 0:
        try:
            from app.data.fyers_client import fetch_history_candles
            index_candles = merge_history(
                index_candles, fetch_history_candles(UNDERLYING, args.timeframe, args.history_days)
            )
        except Exception as error:
            print(f"Warning: history warm-up unavailable: {error}", file=sys.stderr)

    engine = PaperTradingEngine.from_log(args.capital, trade_logger=TradeLogger())
    output = {}
    adjust = exit_adjuster(args.exit_slippage_pct)

    if args.monitor or args.square_off:
        closed, unpriced = [], []
        for symbol in sorted({t["symbol"] for t in engine.open_positions}):
            option_candles = candles_for(candle_path, symbol)
            if option_candles is None:
                unpriced.append(symbol)
                continue
            if args.square_off:
                price = float(option_candles.iloc[-1]["close"])
                closed += square_off(engine, symbol, price, reason="EOD",
                                     charges=charges_for_trade, exit_adjust=adjust)
            else:
                closed += monitor_open_trades(engine, option_candles, symbol,
                                              charges=charges_for_trade, exit_adjust=adjust)
        output["closed_trades"] = closed
        if unpriced:
            output["no_price_for"] = unpriced

    if args.square_off:
        print(json.dumps(output, indent=2, default=str))
        return 0

    result = run_option_cycle(
        index_candles,
        chain_loader=make_chain_loader(args),
        engine=engine,
        decision_logger=DecisionLogger(),
        now=now,
        capital=args.capital,
        risk_percent=args.risk_percent,
        daily_loss_limit_percent=args.daily_loss_limit,
        sl_pct=args.sl_pct,
        reward_multiple=args.reward_multiple,
        strike_offset=args.strike_offset,
        max_spread_pct=args.max_spread_pct,
        max_lots=args.max_lots,
        lot_size=args.lot_size,
        allow_expiry_day=args.allow_expiry_day,
        cooldown_minutes=args.cooldown_minutes,
        holidays=[date.fromisoformat(d) for d in args.holiday],
        on_open=lambda symbol: add_to_watchlist(symbol, now.date()),
    )
    output.update(result)
    print(json.dumps(output, indent=2, default=str))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
