"""Run the local candle-analysis and paper-trading workflow.

Examples:
    python main.py --candles data/candles/candles_2026-11-02_5m.csv --symbol NSE:NIFTY50-INDEX
    python main.py --raw data/raw/market_data_2026-11-02.csv --symbol NSE:NIFTY50-INDEX --execute-paper
"""

import argparse
import json
from pathlib import Path

from app.data.candle_builder import CandleBuilder
from app.workflow import (
    create_paper_trade_proposal,
    execute_paper_trade,
    load_candles,
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
    parser.add_argument("--daily-loss", type=float, default=0.0, help="Today's realised loss.")
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
    proposal = create_paper_trade_proposal(
        candles,
        capital=args.capital,
        risk_percent=args.risk_percent,
        daily_loss=args.daily_loss,
    )
    if args.execute_paper and proposal["risk"] and proposal["risk"].get("approved"):
        proposal["paper_trade"] = execute_paper_trade(proposal, args.capital)

    print(json.dumps(proposal, indent=2, default=str))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
