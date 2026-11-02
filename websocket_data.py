
import os
from dotenv import load_dotenv
from fyers_apiv3.FyersWebsocket import data_ws

load_dotenv()

APP_ID = os.getenv("FYERS_APP_ID")

with open("token.txt", "r") as file:
    ACCESS_TOKEN = file.read().strip()

# Initial watchlist
symbols = [
    "NSE:NIFTY50-INDEX",
    "NSE:NIFTYBANK-INDEX",
    "NSE:RELIANCE-EQ",
    "NSE:HDFCBANK-EQ",
    "NSE:INFY-EQ",
    "NSE:TCS-EQ",
    "NSE:SBIN-EQ",
    "NSE:ICICIBANK-EQ",
]

def on_message(message):
    print("\nLIVE MARKET UPDATE")
    print(message)

def on_error(message):
    print("WebSocket Error:", message)

def on_close(message):
    print("WebSocket Closed:", message)

def on_connect():
    print("Connected to FYERS WebSocket!")
    print("Subscribing to market instruments...")

    fyers.subscribe(
        symbols=symbols,
        data_type="SymbolUpdate"
    )

    print("Subscribed:", len(symbols), "symbols")

    fyers.keep_running()

# Create WebSocket connection
fyers = data_ws.FyersDataSocket(
    access_token=f"{APP_ID}:{ACCESS_TOKEN}",
    log_path="",
    litemode=False,
    write_to_file=False,
    reconnect=True,
    on_connect=on_connect,
    on_close=on_close,
    on_error=on_error,
    on_message=on_message,
    reconnect_retry=10
)

print("Starting FYERS live market stream...")
fyers.connect()
