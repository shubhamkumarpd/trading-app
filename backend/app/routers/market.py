import datetime
from fastapi import APIRouter, Query
from typing import Dict, Any, List, Optional
from app.redis_client import get_fyers_token
from app.services.fyers_auth import get_fyers_instance

router = APIRouter(prefix="/api/market", tags=["Market Data"])

DEFAULT_INDICES = [
    {
        "symbol": "NSE:NIFTY50-INDEX",
        "name": "NIFTY 50",
        "category": "benchmark",
        "exchange": "NSE",
        "ltp": 25144.30,
        "change": -155.05,
        "change_percent": -0.61,
        "high": 25246.35,
        "low": 25054.40,
        "open": 25209.85,
        "prev_close": 25299.35
    },
    {
        "symbol": "BSE:SENSEX-INDEX",
        "name": "SENSEX",
        "category": "benchmark",
        "exchange": "BSE",
        "ltp": 81592.45,
        "change": -318.56,
        "change_percent": -0.39,
        "high": 81920.10,
        "low": 81340.20,
        "open": 81850.00,
        "prev_close": 81911.01
    },
    {
        "symbol": "NSE:NIFTYBANK-INDEX",
        "name": "BANK NIFTY",
        "category": "benchmark",
        "exchange": "NSE",
        "ltp": 61034.10,
        "change": -484.40,
        "change_percent": -0.79,
        "high": 61300.55,
        "low": 60780.55,
        "open": 61300.55,
        "prev_close": 61518.50
    },
    {
        "symbol": "NSE:FINNIFTY-INDEX",
        "name": "FIN NIFTY",
        "category": "benchmark",
        "exchange": "NSE",
        "ltp": 27855.50,
        "change": -201.65,
        "change_percent": -0.72,
        "high": 27940.40,
        "low": 27683.25,
        "open": 27940.40,
        "prev_close": 28057.15
    },
    {
        "symbol": "NSE:INDIAVIX-INDEX",
        "name": "INDIA VIX",
        "category": "volatility",
        "exchange": "NSE",
        "ltp": 15.50,
        "change": -1.12,
        "change_percent": -6.74,
        "high": 16.85,
        "low": 14.90,
        "open": 16.62,
        "prev_close": 16.62
    },
    {
        "symbol": "NSE:NIFTYIT-INDEX",
        "name": "NIFTY IT",
        "category": "sectoral",
        "exchange": "NSE",
        "ltp": 31931.15,
        "change": -232.40,
        "change_percent": -0.72,
        "high": 32150.00,
        "low": 31800.00,
        "open": 32100.00,
        "prev_close": 32163.55
    },
    {
        "symbol": "NSE:NIFTYAUTO-INDEX",
        "name": "NIFTY AUTO",
        "category": "sectoral",
        "exchange": "NSE",
        "ltp": 27929.85,
        "change": -301.15,
        "change_percent": -1.07,
        "high": 28210.00,
        "low": 27850.00,
        "open": 28180.00,
        "prev_close": 28231.00
    }
]

SYMBOL_NAME_MAP = {
    "NSE:NIFTY50-INDEX": ("NIFTY 50", "benchmark", "NSE"),
    "BSE:SENSEX-INDEX": ("SENSEX", "benchmark", "BSE"),
    "NSE:NIFTYBANK-INDEX": ("BANK NIFTY", "benchmark", "NSE"),
    "NSE:FINNIFTY-INDEX": ("FIN NIFTY", "benchmark", "NSE"),
    "NSE:INDIAVIX-INDEX": ("INDIA VIX", "volatility", "NSE"),
    "NSE:NIFTYIT-INDEX": ("NIFTY IT", "sectoral", "NSE"),
    "NSE:NIFTYAUTO-INDEX": ("NIFTY AUTO", "sectoral", "NSE"),
    "NSE:RELIANCE-EQ": ("RELIANCE", "equity", "NSE"),
    "NSE:HDFCBANK-EQ": ("HDFC BANK", "equity", "NSE"),
    "NSE:TCS-EQ": ("TCS", "equity", "NSE"),
    "NSE:TATAMOTORS-EQ": ("TATA MOTORS", "equity", "NSE"),
    "NSE:INFY-EQ": ("INFOSYS", "equity", "NSE")
}


_IST = datetime.timezone(datetime.timedelta(hours=5, minutes=30))
_STEP_MINUTES = {"1": 1, "2": 2, "3": 3, "5": 5, "10": 10, "15": 15, "20": 20, "30": 30, "45": 45, "60": 60, "120": 120, "240": 240}


def _demo_candles(symbol: str, resolution: str, days: int) -> List[Dict[str, Any]]:
    """Sample candles shown only when Fyers is not connected (the response says is_live=false).

    Weekday NSE sessions 09:15-15:30 IST, seeded by symbol so the chart does not jump on refresh.
    Indices get no volume, like the real feed; equities do.
    """
    import math
    import random

    rnd = random.Random(f"{symbol}|{resolution}")
    base = next((i["ltp"] for i in DEFAULT_INDICES if i["symbol"] == symbol), 1500.0)
    has_volume = symbol.endswith("-EQ")
    now = datetime.datetime.now(_IST)
    start_day = (now - datetime.timedelta(days=days)).date()

    daily = resolution in ("D", "1D")
    step = _STEP_MINUTES.get(resolution, 15)
    vol = 0.0095 if daily else 0.0010 * math.sqrt(step / 15)

    # walk forward from an arbitrary start, then rescale so the series ends near `base`
    raw: List[Dict[str, Any]] = []
    price = 100.0
    day = start_day
    while day <= now.date():
        if day.weekday() < 5:
            if daily:
                slots = [datetime.datetime.combine(day, datetime.time(0, 0), _IST)]
            else:
                slots = []
                t = datetime.datetime.combine(day, datetime.time(9, 15), _IST)
                close_t = datetime.datetime.combine(day, datetime.time(15, 30), _IST)
                while t < close_t:
                    slots.append(t)
                    t += datetime.timedelta(minutes=step)
            for t in slots:
                if t > now:
                    break
                o = price
                c = o * (1 + rnd.gauss(0.00002, vol))
                h = max(o, c) * (1 + abs(rnd.gauss(0, vol * 0.6)))
                l = min(o, c) * (1 - abs(rnd.gauss(0, vol * 0.6)))
                v = int(rnd.uniform(8_000, 60_000) * (1.8 if t.hour == 9 else 1.0)) if has_volume else 0
                raw.append({"time": int(t.timestamp()), "open": o, "high": h, "low": l, "close": c, "volume": v})
                price = c
        day += datetime.timedelta(days=1)

    if not raw:
        return []
    k = base / raw[-1]["close"]
    return [
        {
            "time": r["time"],
            "open": round(r["open"] * k, 2),
            "high": round(r["high"] * k, 2),
            "low": round(r["low"] * k, 2),
            "close": round(r["close"] * k, 2),
            "volume": r["volume"],
        }
        for r in raw
    ]


@router.get("/indices")
def get_indices_quotes():
    token = get_fyers_token()
    if token:
        try:
            fyers = get_fyers_instance(token=token)
            symbols_str = ",".join(list(SYMBOL_NAME_MAP.keys())[:7])
            res = fyers.quotes(data={"symbols": symbols_str})
            if isinstance(res, dict) and res.get("s") == "ok":
                items: List[Dict[str, Any]] = []
                for q in res.get("d", []):
                    sym = q.get("n", "")
                    v = q.get("v", {})
                    name, cat, ex = SYMBOL_NAME_MAP.get(sym, (sym, "other", "NSE"))
                    items.append({
                        "symbol": sym,
                        "name": name,
                        "category": cat,
                        "exchange": ex,
                        "ltp": float(v.get("lp", 0)),
                        "change": float(v.get("ch", 0)),
                        "change_percent": float(v.get("chp", 0)),
                        "high": float(v.get("high_price", 0)),
                        "low": float(v.get("low_price", 0)),
                        "open": float(v.get("open_price", 0)),
                        "prev_close": float(v.get("prev_close_price", 0))
                    })
                if items:
                    return {
                        "status": "success",
                        "is_live": True,
                        "indices": items
                    }
        except Exception:
            pass

    return {
        "status": "success",
        "is_live": False,
        "indices": DEFAULT_INDICES
    }

@router.get("/history")
def get_symbol_history(
    symbol: str = Query(..., description="Symbol e.g. NSE:NIFTY50-INDEX"),
    resolution: str = Query("15", description="Resolution e.g. 1, 5, 15, 60, D"),
    days: int = Query(7, description="Number of days of history")
):
    token = get_fyers_token()
    # FYERS history limits: ~100 days per request for intraday, 366 for daily
    max_days = 366 if resolution in ("D", "1D") else 100
    days = max(1, min(days, max_days))
    today = datetime.date.today()
    from_date = (today - datetime.timedelta(days=days)).strftime("%Y-%m-%d")
    to_date = today.strftime("%Y-%m-%d")

    if token:
        try:
            fyers = get_fyers_instance(token=token)
            data = {
                "symbol": symbol,
                "resolution": resolution,
                "date_format": "1",
                "range_from": from_date,
                "range_to": to_date,
                "cont_flag": "1"
            }
            res = fyers.history(data=data)
            if isinstance(res, dict) and res.get("s") == "ok" and "candles" in res:
                formatted_candles = []
                for c in res["candles"]:
                    formatted_candles.append({
                        "time": c[0],
                        "open": float(c[1]),
                        "high": float(c[2]),
                        "low": float(c[3]),
                        "close": float(c[4]),
                        "volume": float(c[5]) if len(c) > 5 else 0
                    })
                return {
                    "status": "success",
                    "is_live": True,
                    "symbol": symbol,
                    "resolution": resolution,
                    "candles": formatted_candles
                }
        except Exception:
            pass

    fallback_candles = _demo_candles(symbol, resolution, days)

    return {
        "status": "success",
        "is_live": False,
        "symbol": symbol,
        "resolution": resolution,
        "candles": fallback_candles
    }

@router.get("/depth")
def get_symbol_depth(symbol: str = Query("NSE:NIFTY50-INDEX")):
    """
    Returns Level-2 Market Depth from Fyers API
    """
    token = get_fyers_token()
    if token:
        try:
            fyers = get_fyers_instance(token=token)
            res = fyers.depth(data={"symbol": symbol, "ohlcv_flag": "1"})
            if isinstance(res, dict) and res.get("s") == "ok" and res.get("d"):
                data = list(res["d"].values())[0]
                return {
                    "status": "success",
                    "is_live": True,
                    "symbol": symbol,
                    "depth": data
                }
        except Exception:
            pass

    # High precision fallback depth
    return {
        "status": "success",
        "is_live": False,
        "symbol": symbol,
        "depth": {
            "totalbuyqty": 184500,
            "totalsellqty": 142200,
            "bids": [
                {"price": 25144.10, "volume": 1250, "orders": 12},
                {"price": 25143.50, "volume": 3400, "orders": 24},
                {"price": 25142.80, "volume": 5600, "orders": 31},
                {"price": 25141.20, "volume": 2800, "orders": 18},
                {"price": 25140.00, "volume": 4200, "orders": 42}
            ],
            "ask": [
                {"price": 25144.50, "volume": 890, "orders": 8},
                {"price": 25145.20, "volume": 2100, "orders": 19},
                {"price": 25146.00, "volume": 4300, "orders": 35},
                {"price": 25147.50, "volume": 3700, "orders": 22},
                {"price": 25148.00, "volume": 5100, "orders": 48}
            ],
            "lower_ckt": 22630.00,
            "upper_ckt": 27650.00
        }
    }
