from fastapi import APIRouter
from typing import Dict, Any, List
from app.config import settings
from app.redis_client import get_fyers_token, get_cached_profile
from app.services.fyers_auth import get_fyers_instance, fetch_and_cache_profile

router = APIRouter(prefix="/api/user", tags=["User & Funds"])

@router.get("/profile")
def get_user_profile():
    token = get_fyers_token()
    if token:
        profile = get_cached_profile()
        if not profile:
            res = fetch_and_cache_profile(token)
            if res.get("s") == "ok":
                profile = res.get("data")
        if profile:
            return {
                "status": "success",
                "is_live": True,
                "profile": profile,
                "app_id": settings.FYERS_APP_ID
            }
    
    # Return placeholder / demo profile if not logged in yet
    return {
        "status": "success",
        "is_live": False,
        "profile": {
            "name": "Shubham Kumar",
            "fy_id": "FYERS-DEMO",
            "email_id": "shubham@example.com",
            "mobile_number": "+91 98765 43210",
            "pan": "ABCDE1234F",
            "totp": True,
            "account_type": "Individual Resident",
            "active_segments": ["NSE_EQ", "NSE_FO", "BSE_EQ", "MCX_COMM"],
            "kyc_status": "Verified",
            "broker": "Fyers Securities"
        },
        "app_id": settings.FYERS_APP_ID
    }

@router.get("/funds")
def get_user_funds():
    token = get_fyers_token()
    if token:
        try:
            fyers = get_fyers_instance(token=token)
            funds_data = fyers.funds()
            if isinstance(funds_data, dict) and funds_data.get("s") == "ok":
                fund_limits: List[Dict[str, Any]] = funds_data.get("fund_limit", [])
                
                equity_available = 0.0
                equity_used = 0.0
                total_balance = 0.0
                collateral = 0.0
                
                for item in fund_limits:
                    title = item.get("title", "").lower()
                    eq_amt = float(item.get("equityAmount", 0) or 0)
                    if "total balance" in title:
                        total_balance = eq_amt
                    elif "available" in title or "clear balance" in title:
                        equity_available = eq_amt
                    elif "utilized" in title or "used" in title:
                        equity_used = eq_amt
                    elif "collateral" in title:
                        collateral = eq_amt
                
                return {
                    "status": "success",
                    "is_live": True,
                    "available_balance": equity_available or total_balance,
                    "used_margin": equity_used,
                    "collateral_margin": collateral,
                    "total_balance": total_balance or (equity_available + equity_used),
                    "raw_limits": fund_limits
                }
        except Exception:
            pass

    return {
        "status": "success",
        "is_live": False,
        "available_balance": 214278.67,
        "used_margin": 0.0,
        "collateral_margin": 0.0,
        "total_balance": 214278.67,
    }

@router.get("/holdings")
def get_user_holdings():
    token = get_fyers_token()
    if token:
        try:
            fyers = get_fyers_instance(token=token)
            holdings_data = fyers.holdings()
            if isinstance(holdings_data, dict) and holdings_data.get("s") == "ok":
                return {
                    "status": "success",
                    "is_live": True,
                    "overall": holdings_data.get("overall", {}),
                    "holdings": holdings_data.get("holdings", [])
                }
        except Exception:
            pass
    return {
        "status": "success",
        "is_live": False,
        "overall": {"count_total": 0, "total_current_value": 0, "total_investment": 0, "total_pl": 0},
        "holdings": []
    }

@router.get("/positions")
def get_user_positions():
    token = get_fyers_token()
    if token:
        try:
            fyers = get_fyers_instance(token=token)
            pos_data = fyers.positions()
            if isinstance(pos_data, dict) and pos_data.get("s") == "ok":
                return {
                    "status": "success",
                    "is_live": True,
                    "overall": pos_data.get("overall", {}),
                    "positions": pos_data.get("netPositions", [])
                }
        except Exception:
            pass
    return {
        "status": "success",
        "is_live": False,
        "overall": {"count_open": 0, "count_total": 0, "pl_realized": 0, "pl_total": 0, "pl_unrealized": 0},
        "positions": []
    }
