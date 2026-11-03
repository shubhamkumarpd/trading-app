import atexit
import os
import csv
import threading
import time
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

# Instruments to monitor.  Phase 1 trades NIFTY 50 weekly options only; the
# option contract being held is added at run time through the watch file.
SYMBOLS = [
    "NSE:NIFTY50-INDEX",
]

WATCH_FILE = Path("data") / f"watch_symbols_{datetime.now():%Y-%m-%d}.txt"
subscribed_extra = set()
connected = False

# Create CSV directory
Path("data/raw").mkdir(parents=True, exist_ok=True)

# Daily CSV filename
date = datetime.now().strftime("%Y-%m-%d")
filename = f"data/raw/market_data_{date}.csv"

file_exists = os.path.exists(filename)

csv_file = open(filename, "a", newline="", encoding="utf-8")
# The websocket reconnects automatically (reconnect=True), so the file must stay
# open across disconnects. Close it only when the process exits.
atexit.register(csv_file.close)

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
    # Do not close the file here: after an automatic reconnect on_message would
    # write to a closed file and raise ValueError. Just flush what we have.
    print("Connection closed:", message)
    if not csv_file.closed:
        csv_file.flush()


def read_watch_symbols():
    """Option contracts that options_main.py asked us to record today."""
    if not WATCH_FILE.exists():
        return []
    return [line.strip() for line in WATCH_FILE.read_text().splitlines() if line.strip()]


def subscribe_watch_symbols():
    new = [s for s in read_watch_symbols() if s not in subscribed_extra]
    if not new:
        return
    fyers.subscribe(symbols=new, data_type="SymbolUpdate")
    subscribed_extra.update(new)
    print("Subscribed to option contracts:", new)


def watch_loop():
    while True:
        time.sleep(5)
        if not connected:
            continue
        try:
            subscribe_watch_symbols()
        except Exception as error:  # never let the watcher kill the collector
            print("Watch-file subscribe failed:", error)


def on_connect():
    global connected
    print("Connected to FYERS!")
    print("Subscribing to instruments...")

    fyers.subscribe(
        symbols=SYMBOLS,
        data_type="SymbolUpdate"
    )

    # After an automatic reconnect the earlier option subscriptions are gone.
    subscribed_extra.clear()
    connected = True
    subscribe_watch_symbols()

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
threading.Thread(target=watch_loop, daemon=True).start()
fyers.keep_running()

