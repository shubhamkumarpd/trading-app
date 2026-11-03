"""Per-cycle decision log, including cycles that did not trade.

The trade log only records executed trades, so it cannot show how often the
analysis was right or wrong when it chose to stay out.  One row is written per
analysis cycle to ``logs/decisions/decisions_<date>.csv``.
"""

import csv
from datetime import datetime
from pathlib import Path

FIELDS = [
    "logged_at",
    "symbol",
    "candle_time",
    "index_close",
    "market_condition",
    "confidence",
    "bullish_score",
    "bearish_score",
    "rsi",
    "atr",
    "signal_action",
    "signal_reason",
    "outcome",          # OPENED / REJECTED / NO_TRADE / SKIPPED
    "outcome_reason",
    "option_symbol",
    "strike",
    "option_type",
    "dte",
    "bid",
    "ask",
    "spread_pct",
    "trade_id",
]


class DecisionLogger:
    def __init__(self, log_dir="logs/decisions"):
        self.log_dir = Path(log_dir)
        self.log_dir.mkdir(parents=True, exist_ok=True)

    def _path(self, day=None):
        day = day or datetime.now().astimezone().strftime("%Y-%m-%d")
        return self.log_dir / f"decisions_{day}.csv"

    def log(self, record: dict, day=None) -> dict:
        path = self._path(day)
        is_new = not path.exists()

        row = {field: record.get(field, "") for field in FIELDS}
        if not row["logged_at"]:
            row["logged_at"] = datetime.now().astimezone().isoformat()

        with open(path, "a", newline="", encoding="utf-8") as file:
            writer = csv.DictWriter(file, fieldnames=FIELDS)
            if is_new:
                writer.writeheader()
            writer.writerow(row)

        return row

    def read(self, day=None) -> list[dict]:
        path = self._path(day)
        if not path.exists():
            return []
        with open(path, "r", newline="", encoding="utf-8") as file:
            return list(csv.DictReader(file))
