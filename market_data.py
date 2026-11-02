
import os
from dotenv import load_dotenv
from fyers_apiv3 import fyersModel

load_dotenv()

APP_ID = os.getenv("FYERS_APP_ID")

with open("token.txt", "r") as f:
    ACCESS_TOKEN = f.read().strip()

fyers = fyersModel.FyersModel(
    client_id=APP_ID,
    token=ACCESS_TOKEN,
    is_async=False,
    log_path=""
)

symbols = "NSE:NIFTY50-INDEX,NSE:NIFTYBANK-INDEX"

response = fyers.quotes(data={"symbols": symbols})

print("\n========== LIVE MARKET DATA ==========\n")

if response.get("s") == "ok":
    for item in response.get("d", []):
        values = item["v"]

        print(f"Symbol: {values.get('symbol')}")
        print(f"Price: {values.get('lp')}")
        print(f"Change: {values.get('ch')}")
        print(f"Change %: {values.get('chp')}%")
        print("--------------------------------")
else:
    print("API Error:", response)

