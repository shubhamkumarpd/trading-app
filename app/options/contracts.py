"""NIFTY weekly option helpers: expiry calendar, option chain parsing, strike pick.

Phase 1 trades only NIFTY 50 weekly options, as a buyer: a bullish index signal
buys a CE, a bearish one buys a PE.  Nothing here places an order.

The FYERS option-chain layout parsed below follows the public ``optionchain``
API documentation.  It has not been checked against a live response yet, so
``parse_option_chain`` fails loudly when the layout is not what it expects.
"""

from dataclasses import dataclass
from datetime import date, timedelta
import math

import pandas as pd

UNDERLYING = "NSE:NIFTY50-INDEX"
# NSE lot size for NIFTY from January 2026.  NSE revises it now and then, so it
# is a parameter everywhere and must be rechecked when a new value is announced.
NIFTY_LOT_SIZE = 65
STRIKE_STEP = 50
EXPIRY_WEEKDAY = 1  # Tuesday; NSE moved the weekly expiry here in Sept 2025.


class ContractRejected(ValueError):
    """The option contract cannot be used; the message says why."""


@dataclass(frozen=True)
class OptionContract:
    symbol: str
    strike: int
    option_type: str
    expiry: date
    dte: int
    bid: float
    ask: float
    ltp: float
    spread_pct: float
    lot_size: int


def next_weekly_expiry(on: date, holidays=()) -> date:
    """First weekly NIFTY expiry on or after ``on``.

    Expiry is Tuesday.  When Tuesday is a holiday it moves to the previous
    trading day.  ``holidays`` must be supplied by the caller; there is no
    built-in NSE holiday calendar.
    """
    holiday_set = set(holidays)
    tuesday = on + timedelta(days=(EXPIRY_WEEKDAY - on.weekday()) % 7)

    expiry = tuesday
    while expiry.weekday() >= 5 or expiry in holiday_set:
        expiry -= timedelta(days=1)

    if expiry < on:
        return next_weekly_expiry(tuesday + timedelta(days=1), holiday_set)
    return expiry


def days_to_expiry(on: date, expiry: date) -> int:
    """Calendar days left; theta runs on calendar days, so weekends count."""
    return (expiry - on).days


def atm_strike(spot: float, step: int = STRIKE_STEP) -> int:
    if spot <= 0:
        raise ValueError("Spot price must be positive.")
    return int(math.floor(spot / step + 0.5)) * step


def option_type_for(action: str) -> str:
    """A buyer goes long a call on BUY (bullish) and a put on SELL (bearish)."""
    if action == "BUY":
        return "CE"
    if action == "SELL":
        return "PE"
    raise ValueError(f"Unsupported action: {action!r}")


def parse_option_chain(response: dict) -> tuple[float, pd.DataFrame]:
    """Return ``(spot, chain)`` from a FYERS ``optionchain`` response.

    ``chain`` has one row per CE/PE with symbol, strike, option_type, bid, ask
    and ltp.  The underlying itself is the row without a CE/PE type.
    """
    if response.get("s") != "ok" and response.get("code") != 200:
        raise RuntimeError(f"FYERS option chain request failed: {response}")

    rows = (response.get("data") or {}).get("optionsChain")
    if not rows:
        raise ValueError("Option chain response has no 'optionsChain' rows.")

    spot = None
    options = []
    for row in rows:
        option_type = row.get("option_type")
        if option_type in ("CE", "PE"):
            options.append({
                "symbol": row.get("symbol"),
                "strike": row.get("strike_price"),
                "option_type": option_type,
                "bid": row.get("bid"),
                "ask": row.get("ask"),
                "ltp": row.get("ltp"),
            })
        else:
            spot = row.get("ltp")

    if not options:
        raise ValueError("Option chain contains no CE/PE rows.")

    chain = pd.DataFrame(options)
    if spot is None or float(spot) <= 0:
        raise ValueError("Option chain has no underlying price.")

    return float(spot), chain


def select_contract(
    chain: pd.DataFrame,
    spot: float,
    action: str,
    today: date,
    expiry: date,
    lot_size: int = NIFTY_LOT_SIZE,
    strike_offset: int = 0,
    max_spread_pct: float = 3.0,
    step: int = STRIKE_STEP,
) -> OptionContract:
    """Pick the contract to buy for ``action`` or raise :class:`ContractRejected`.

    ``strike_offset`` moves the strike in-the-money by that many steps (0 =
    at-the-money).  Far-out-of-the-money strikes are never chosen.  The quote
    must be two-sided and its spread no wider than ``max_spread_pct``.
    """
    if strike_offset < 0:
        raise ValueError("strike_offset must be zero or positive (ITM steps).")

    option_type = option_type_for(action)
    atm = atm_strike(spot, step)
    strike = atm - strike_offset * step if option_type == "CE" else atm + strike_offset * step

    rows = chain[(chain["option_type"] == option_type) & (chain["strike"] == strike)]
    if rows.empty:
        raise ContractRejected(f"No {option_type} quote for strike {strike} in the option chain.")

    row = rows.iloc[0]
    bid = float(row["bid"] or 0)
    ask = float(row["ask"] or 0)
    if bid <= 0 or ask <= 0 or ask < bid:
        raise ContractRejected(f"{row['symbol']} has no usable two-sided quote (bid={bid}, ask={ask}).")

    mid = (bid + ask) / 2
    spread_pct = (ask - bid) / mid * 100
    if spread_pct > max_spread_pct:
        raise ContractRejected(
            f"{row['symbol']} spread {spread_pct:.2f}% is above the {max_spread_pct}% limit."
        )

    return OptionContract(
        symbol=str(row["symbol"]),
        strike=int(strike),
        option_type=option_type,
        expiry=expiry,
        dte=days_to_expiry(today, expiry),
        bid=bid,
        ask=ask,
        ltp=float(row["ltp"] or 0),
        spread_pct=round(spread_pct, 2),
        lot_size=int(lot_size),
    )


def fetch_option_chain(client, strikecount: int = 5, underlying: str = UNDERLYING) -> dict:
    """Call the FYERS option chain endpoint (live; needs a valid token)."""
    return client.optionchain(data={"symbol": underlying, "strikecount": strikecount, "timestamp": ""})
