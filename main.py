"""Run the local candle-analysis and paper-trading workflow.

Examples:
    python main.py --candles data/candles/candles_2026-11-02_5m.csv --symbol NSE:NIFTY50-INDEX
    python main.py --raw data/raw/market_data_2026-11-02.csv --symbol NSE:NIFTY50-INDEX --execute-paper
"""

import argparse
import json
import sys
from pathlib import Path

from app.data.candle_builder import CandleBuilder
from app.workflow import (
    create_paper_trade_proposal,
    current_daily_loss,
    execute_paper_trade,
    load_candles,
    merge_history,
    monitor_paper_trades,
    square_off_paper_trades,
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Analyze candles for a paper trade.")
    source = parser.add_mutually_exclusive_group(required=True)
    source.add_argument("--candles", help="Existing OHLC candle CSV.")
    source.add_argument("--raw", help="Raw tick CSV to convert into candles first.")
    parser.add_argument("--symbol", required=True, help="FYERS symbol to analyze.")
    parser.add_argument("--timeframe", type=int, default=5, help="Candle timeframe in minutes.")
    parser.add_argument("--capital", type=float, default=100_000, help="Paper capital.")
    parser.add_argument("--risk-percent", type=float, default=1.0, help="Risk per trade (0-1).")
    parser.add_argument(
        "--daily-loss",
        type=float,
        default=None,
        help="Today's realised loss. Defaults to the net loss in today's paper-trade log.",
    )
    parser.add_argument(
        "--history-days",
        type=int,
        default=0,
        help="Prepend this many days of FYERS history so indicators are warm at the open (0 = off).",
    )
    parser.add_argument(
        "--monitor",
        action="store_true",
        help="Close open paper trades for the symbol that hit their stop-loss or target.",
    )
    parser.add_argument(
        "--square-off",
        action="store_true",
        help="Close open paper trades for the symbol at the latest close and exit (end of day).",
    )
    parser.add_argument(
        "--execute-paper",
        action="store_true",
        help="Open an approved simulated trade and log it locally.",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    candle_path = Path(args.candles) if args.candles else None
    if args.raw:
        candle_path, count = CandleBuilder(args.timeframe).build_from_csv(args.raw)
        print(f"Built {count} completed candles: {candle_path}")

    candles = load_candles(candle_path, args.symbol)

    if args.history_days > 0:
        try:
            # Imported here so offline analysis does not need the FYERS SDK.
            from app.data.fyers_client import fetch_history_candles

            history = fetch_history_candles(
                args.symbol, args.timeframe, args.history_days
            )
            candles = merge_history(candles, history)
        except Exception as error:  # warm-up is optional; keep analyzing
            print(f"Warning: history warm-up unavailable: {error}", file=sys.stderr)

    if args.square_off:
        closed = square_off_paper_trades(candles, args.symbol, args.capital)
        print(json.dumps({"squared_off": closed}, indent=2, default=str))
        return 0

    closed_trades = None
    if args.monitor:
        closed_trades = monitor_paper_trades(candles, args.symbol, args.capital)

    daily_loss = args.daily_loss
    if daily_loss is None:
        daily_loss = current_daily_loss(args.capital)

    proposal = create_paper_trade_proposal(
        candles,
        capital=args.capital,
        risk_percent=args.risk_percent,
        daily_loss=daily_loss,
    )
    if closed_trades is not None:
        proposal["closed_trades"] = closed_trades

    if args.execute_paper and proposal["risk"] and proposal["risk"].get("approved"):
        try:
            proposal["paper_trade"] = execute_paper_trade(proposal, args.capital)
        except ValueError as error:
            proposal["paper_trade"] = None
            proposal["paper_trade_error"] = str(error)

    print(json.dumps(proposal, indent=2, default=str))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
