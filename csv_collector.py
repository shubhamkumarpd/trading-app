import os
import csv
from pathlib import Path
from datetime import datetime

from dotenv import load_dotenv
from fyers_apiv3.FyersWebsocket import data_ws

# Load FYERS credentials
load_dotenv()

APP_ID = os.getenv("FYERS_APP_ID")
ACCESS_TOKEN = Path("token.txt").read_text().strip()

if not APP_ID or not ACCESS_TOKEN:
    raise ValueError("FYERS credentials or access token missing")

# Instruments to monitor
SYMBOLS = [
    "NSE:NIFTY50-INDEX",
    "NSE:NIFTYBANK-INDEX"
]

# Create CSV directory
Path("data/raw").mkdir(parents=True, exist_ok=True)

# Daily CSV filename
date = datetime.now().strftime("%Y-%m-%d")
filename = f"data/raw/market_data_{date}.csv"

file_exists = os.path.exists(filename)

csv_file = open(filename, "a", newline="", encoding="utf-8")

writer = csv.writer(csv_file)

if not file_exists:
    writer.writerow([
        "timestamp",
        "symbol",
        "ltp",
        "volume",
        "open",
        "high",
        "low",
        "previous_close"
    ])
    csv_file.flush()


def on_message(message):
    if not isinstance(message, dict):
        return

    symbol = message.get("symbol")

    if not symbol:
        return

    timestamp = datetime.now().astimezone().isoformat()

    writer.writerow([
        timestamp,
        symbol,
        message.get("ltp"),
        message.get("vol_traded_today"),
        message.get("open_price"),
        message.get("high_price"),
        message.get("low_price"),
        message.get("prev_close_price")
    ])

    csv_file.flush()

    print(symbol, "LTP:", message.get("ltp"))


def on_error(message):
    print("WebSocket error:", message)


def on_close(message):
    print("Connection closed:", message)
    csv_file.close()


def on_connect():
    print("Connected to FYERS!")
    print("Subscribing to instruments...")

    fyers.subscribe(
        symbols=SYMBOLS,
        data_type="SymbolUpdate"
    )

    print("CSV data collection started.")


fyers = data_ws.FyersDataSocket(
    access_token=f"{APP_ID}:{ACCESS_TOKEN}",
    log_path="",
    litemode=False,
    write_to_file=False,
    reconnect=True,
    on_connect=on_connect,
    on_message=on_message,
    on_error=on_error,
    on_close=on_close
)

print("Starting FYERS CSV collector...")

fyers.connect()
fyers.keep_running()

