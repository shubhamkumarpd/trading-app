import os
from datetime import datetime, timedelta
from dotenv import load_dotenv
from fyers_apiv3 import fyersModel

load_dotenv()

APP_ID = os.getenv("FYERS_APP_ID")

with open("token.txt", "r") as file:
    ACCESS_TOKEN = file.read().strip()

fyers = fyersModel.FyersModel(
    client_id=APP_ID,
    token=ACCESS_TOKEN,
    is_async=False,
    log_path=""
)

today = datetime.now().strftime("%Y-%m-%d")
from_date = (datetime.now() - timedelta(days=10)).strftime("%Y-%m-%d")

data = {
    "symbol": "NSE:NIFTY50-INDEX",
    "resolution": "5",
    "date_format": "1",
    "range_from": from_date,
    "range_to": today,
    "cont_flag": "1"
}

response = fyers.history(data=data)

if response.get("s") == "ok":
    candles = response.get("candles", [])
    print("Historical candles received:", len(candles))

    for candle in candles[-5:]:
        print(candle)
else:
    print("History API error:", response)