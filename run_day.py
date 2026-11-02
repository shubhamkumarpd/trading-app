"""Run FYERS collection and paper-trade analysis during one NSE session.

The runner starts the existing collector, performs a fresh analysis at each
candle boundary, and stops the collector at the configured market close.  It
does not submit broker orders or open paper positions automatically.
"""

import argparse
import subprocess
import sys
import time
from datetime import datetime, time as clock_time, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo


IST = ZoneInfo("Asia/Kolkata")
SESSION_START = clock_time(9, 15)
SESSION_END = clock_time(15, 30)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Run the paper-trading analysis for one NSE session.")
    parser.add_argument("--symbol", action="append", required=True, help="Symbol to analyze; may be supplied more than once.")
    parser.add_argument("--timeframe", type=int, default=5, help="Candle timeframe and analysis interval in minutes.")
    parser.add_argument("--capital", type=float, default=100_000)
    parser.add_argument("--risk-percent", type=float, default=1.0)
    parser.add_argument("--start-now", action="store_true", help="Start immediately instead of waiting for 09:15 IST.")
    return parser.parse_args()


def now_ist() -> datetime:
    return datetime.now(IST)


def in_weekday_session(now: datetime) -> bool:
    return now.weekday() < 5 and SESSION_START <= now.time() < SESSION_END


def seconds_to_next_boundary(minutes: int) -> float:
    now = now_ist()
    elapsed = now.minute % minutes
    next_minute = now.minute + (minutes - elapsed)
    next_boundary = now.replace(second=5, microsecond=0)
    if next_minute >= 60:
        next_boundary = next_boundary.replace(minute=0) + timedelta(hours=1)
    else:
        next_boundary = next_boundary.replace(minute=next_minute)
    return max(1.0, (next_boundary - now).total_seconds())


def analyze(raw_file: Path, args: argparse.Namespace) -> None:
    for symbol in args.symbol:
        command = [
            sys.executable, "main.py", "--raw", str(raw_file), "--symbol", symbol,
            "--timeframe", str(args.timeframe), "--capital", str(args.capital),
            "--risk-percent", str(args.risk_percent),
        ]
        result = subprocess.run(command, check=False, text=True, capture_output=True)
        stamp = now_ist().strftime("%H:%M:%S")
        if result.returncode == 0:
            print(f"[{stamp}] {symbol}\n{result.stdout.strip()}")
        else:
            # Early-session insufficient data is normal; other errors remain visible.
            print(f"[{stamp}] analysis for {symbol} failed: {result.stderr.strip() or result.stdout.strip()}")


def main() -> int:
    args = parse_args()
    if args.timeframe <= 0:
        raise ValueError("--timeframe must be positive")

    current = now_ist()
    if not args.start_now:
        if current.weekday() >= 5:
            print("Today is not an NSE trading weekday; no collector was started.")
            return 0
        if current.time() >= SESSION_END:
            print("The NSE session has already closed for today.")
            return 0
        if current.time() < SESSION_START:
            target = current.replace(hour=SESSION_START.hour, minute=SESSION_START.minute, second=0, microsecond=0)
            wait = (target - current).total_seconds()
            print(f"Waiting until {target.strftime('%H:%M %Z')} to start collection.")
            time.sleep(wait)

    collector = subprocess.Popen([sys.executable, "csv_collector.py"])
    print("FYERS collector started. Press Ctrl+C to stop early.")

    try:
        while args.start_now or in_weekday_session(now_ist()):
            today = now_ist().strftime("%Y-%m-%d")
            raw_file = Path("data/raw") / f"market_data_{today}.csv"
            if raw_file.exists():
                analyze(raw_file, args)
            else:
                print("Waiting for the collector to create today's raw-data file.")
            time.sleep(seconds_to_next_boundary(args.timeframe))
            if args.start_now and now_ist().time() >= SESSION_END:
                break
    except KeyboardInterrupt:
        print("Stopping day runner.")
    finally:
        collector.terminate()
        try:
            collector.wait(timeout=15)
        except subprocess.TimeoutExpired:
            collector.kill()
            collector.wait()
        print("FYERS collector stopped.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
