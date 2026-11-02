
import csv
from collections import defaultdict
from datetime import datetime, timedelta
from pathlib import Path

import pandas as pd


class CandleBuilder:
    def __init__(self, timeframe_minutes=5):
        if timeframe_minutes <= 0:
            raise ValueError("Timeframe must be positive")

        self.timeframe_minutes = timeframe_minutes

    def build_from_csv(self, input_file, output_dir="data/candles"):
        input_path = Path(input_file)

        if not input_path.exists():
            raise FileNotFoundError(input_path)

        output_path = Path(output_dir)
        output_path.mkdir(parents=True, exist_ok=True)

        buckets = defaultdict(list)

        with input_path.open("r", newline="", encoding="utf-8") as file:
            reader = csv.DictReader(file)

            for row in reader:
                try:
                    timestamp = datetime.fromisoformat(row["timestamp"])
                    price = float(row["ltp"])
                    symbol = row["symbol"]

                    if not symbol or price <= 0:
                        continue

                    cumulative_volume = None
                    raw_volume = row.get("volume")

                    if raw_volume not in (None, ""):
                        value = float(raw_volume)
                        if value >= 0:
                            cumulative_volume = value

                    minute = (
                        timestamp.minute // self.timeframe_minutes
                    ) * self.timeframe_minutes

                    candle_time = timestamp.replace(
                        minute=minute,
                        second=0,
                        microsecond=0,
                    )

                    buckets[(symbol, candle_time)].append(
                        (timestamp, price, cumulative_volume)
                    )

                except (ValueError, KeyError, TypeError):
                    continue

        if not buckets:
            raise ValueError("No valid tick data found")

        candles = []
        missing_intervals = defaultdict(list)

        for symbol in sorted({key[0] for key in buckets}):
            symbol_buckets = sorted(
                (key, ticks)
                for key, ticks in buckets.items()
                if key[0] == symbol
            )

            previous_end_volume = None
            previous_candle_time = None

            for (current_symbol, candle_time), ticks in symbol_buckets:
                ticks.sort(key=lambda item: item[0])
                prices = [tick[1] for tick in ticks]

                volume_values = [
                    tick[2] for tick in ticks if tick[2] is not None
                ]

                candle_volume = None

                if volume_values:
                    current_end_volume = volume_values[-1]

                    if previous_end_volume is not None:
                        difference = current_end_volume - previous_end_volume

                        if difference >= 0:
                            candle_volume = difference

                    previous_end_volume = current_end_volume

                if previous_candle_time is not None:
                    expected = previous_candle_time + timedelta(
                        minutes=self.timeframe_minutes
                    )

                    while expected < candle_time:
                        missing_intervals[symbol].append(
                            expected.isoformat()
                        )
                        expected += timedelta(
                            minutes=self.timeframe_minutes
                        )

                previous_candle_time = candle_time

                candle_end = candle_time + timedelta(
                    minutes=self.timeframe_minutes
                )

                # Only retain candles whose interval has ended.
                if candle_end > datetime.now(tz=candle_time.tzinfo):
                    continue

                candles.append({
                    "timestamp": candle_time.isoformat(),
                    "symbol": current_symbol,
                    "open": prices[0],
                    "high": max(prices),
                    "low": min(prices),
                    "close": prices[-1],
                    "volume": candle_volume,
                    "tick_count": len(prices),
                    "data_quality": (
                        "VALID" if candle_volume is not None
                        else "VOLUME_UNAVAILABLE"
                    ),
                })

        if not candles:
            raise ValueError("No completed candles found")

        df = pd.DataFrame(candles)

        date_reference = input_path.stem.replace(
            "market_data_", ""
        )

        output_file = (
            output_path /
            f"candles_{date_reference}_{self.timeframe_minutes}m.csv"
        )

        df.to_csv(output_file, index=False)

        print("Missing intervals:", dict(missing_intervals))

        return output_file, len(df)


if __name__ == "__main__":
    today = datetime.now().astimezone().strftime("%Y-%m-%d")
    input_file = Path("data/raw") / f"market_data_{today}.csv"

    builder = CandleBuilder(timeframe_minutes=5)

    try:
        output_file, count = builder.build_from_csv(input_file)
        print("Candle generation completed")
        print("Output:", output_file)
        print("Completed candles:", count)

    except (FileNotFoundError, ValueError) as error:
        print("Candle generation failed:", error)
