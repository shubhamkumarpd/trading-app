from typing import Optional, Dict, Any
from fyers_apiv3 import fyersModel
from app.config import settings
from app.redis_client import (
    set_fyers_token,
    get_fyers_token,
    set_cached_profile,
    get_cached_profile,
    clear_fyers_session
)

def get_fyers_session(state: str = "tradepro_login") -> fyersModel.SessionModel:
    return fyersModel.SessionModel(
        client_id=settings.FYERS_APP_ID,
        secret_key=settings.FYERS_SECRET_ID,
        redirect_uri=settings.FYERS_REDIRECT_URI,
        response_type="code",
        grant_type="authorization_code",
        state=state
    )

def get_login_url(state: str = "tradepro_login") -> str:
    session = get_fyers_session(state=state)
    return session.generate_authcode()

def exchange_auth_code(auth_code: str) -> Dict[str, Any]:
    session = get_fyers_session()
    session.set_token(auth_code)
    response = session.generate_token()
    
    # Expected format: {"s": "ok", "code": 200, "message": "...", "access_token": "..."}
    if isinstance(response, dict) and response.get("s") == "ok" and "access_token" in response:
        token = response["access_token"]
        set_fyers_token(token)
        # Fetch profile and cache
        profile_res = fetch_and_cache_profile(token)
        return {
            "success": True,
            "access_token": token,
            "profile": profile_res.get("data") if profile_res else None,
            "message": "Token generated successfully"
        }
    else:
        err_msg = response.get("message", "Failed to exchange auth code for token") if isinstance(response, dict) else str(response)
        return {
            "success": False,
            "error": err_msg,
            "raw": response
        }

def get_fyers_instance(token: Optional[str] = None) -> fyersModel.FyersModel:
    active_token = token or get_fyers_token()
    if not active_token:
        raise ValueError("No active Fyers access token found. Please login first.")
    return fyersModel.FyersModel(
        client_id=settings.FYERS_APP_ID,
        token=active_token,
        is_async=False,
        log_level="ERROR"
    )

def fetch_and_cache_profile(token: Optional[str] = None) -> Dict[str, Any]:
    try:
        fyers = get_fyers_instance(token=token)
        profile = fyers.get_profile()
        if isinstance(profile, dict) and profile.get("s") == "ok":
            set_cached_profile(profile.get("data", {}))
            return profile
        return profile
    except Exception as e:
        return {"s": "error", "message": str(e)}

def save_manual_token(token: str) -> Dict[str, Any]:
    """Allows direct entry of an already generated Fyers Access Token"""
    try:
        fyers = fyersModel.FyersModel(
            client_id=settings.FYERS_APP_ID,
            token=token,
            is_async=False,
            log_level="ERROR"
        )
        profile = fyers.get_profile()
        if isinstance(profile, dict) and profile.get("s") == "ok":
            set_fyers_token(token)
            set_cached_profile(profile.get("data", {}))
            return {
                "success": True,
                "profile": profile.get("data"),
                "message": "Access token verified and stored successfully"
            }
        else:
            return {
                "success": False,
                "error": profile.get("message", "Invalid access token or profile fetch failed")
            }
    except Exception as e:
        return {"success": False, "error": str(e)}

def logout_user() -> Dict[str, Any]:
    clear_fyers_session()
    return {"success": True, "message": "Logged out successfully"}
