
import csv
from pathlib import Path
from datetime import datetime, timezone


class TradeLogger:
    def __init__(self, log_dir="logs/trades"):
        self.log_dir = Path(log_dir)
        self.log_dir.mkdir(parents=True, exist_ok=True)

        self.fields = [
            "trade_id",
            "symbol",
            "action",
            "quantity",
            "entry_price",
            "stop_loss",
            "target",
            "opened_at",
            "exit_price",
            "closed_at",
            "exit_reason",
            "gross_pnl",
            "charges",
            "net_pnl",
            "status",
        ]

    def _get_trade_date(self, trade):
        opened_at = trade.get("opened_at")

        if opened_at:
            timestamp = datetime.fromisoformat(
                opened_at.replace("Z", "+00:00")
            )
            return timestamp.astimezone().strftime("%Y-%m-%d")

        return datetime.now().astimezone().strftime("%Y-%m-%d")

    def _get_file_path(self, trade):
        trade_date = self._get_trade_date(trade)
        return self.log_dir / f"trade_history_{trade_date}.csv"

    def _ensure_file(self, file_path):
        if not file_path.exists():
            with open(file_path, "w", newline="", encoding="utf-8") as file:
                writer = csv.DictWriter(file, fieldnames=self.fields)
                writer.writeheader()

    def log_trade(self, trade):
        file_path = self._get_file_path(trade)
        self._ensure_file(file_path)

        trades = self.get_all_trades(
            self._get_trade_date(trade)
        )

        if any(
            str(item["trade_id"]) == str(trade["trade_id"])
            for item in trades
        ):
            return self.update_trade(trade)

        with open(file_path, "a", newline="", encoding="utf-8") as file:
            writer = csv.DictWriter(file, fieldnames=self.fields)
            writer.writerow({
                field: trade.get(field, "")
                for field in self.fields
            })

    def update_trade(self, trade):
        file_path = self._get_file_path(trade)
        self._ensure_file(file_path)

        trades = self.get_all_trades(
            self._get_trade_date(trade)
        )

        updated = False

        for item in trades:
            if str(item["trade_id"]) == str(trade["trade_id"]):
                item.update({
                    field: trade.get(field, item.get(field, ""))
                    for field in self.fields
                })
                updated = True
                break

        if not updated:
            trades.append({
                field: trade.get(field, "")
                for field in self.fields
            })

        with open(file_path, "w", newline="", encoding="utf-8") as file:
            writer = csv.DictWriter(file, fieldnames=self.fields)
            writer.writeheader()
            writer.writerows(trades)

    def get_all_trades(self, trade_date=None):
        if trade_date is None:
            trade_date = datetime.now().astimezone().strftime("%Y-%m-%d")

        file_path = self.log_dir / f"trade_history_{trade_date}.csv"

        if not file_path.exists():
            return []

        with open(file_path, "r", newline="", encoding="utf-8") as file:
            return list(csv.DictReader(file))
