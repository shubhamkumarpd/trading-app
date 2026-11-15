from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel
from typing import Optional, Dict, Any
from app.config import settings
from app.redis_client import get_fyers_token, get_cached_profile
from app.services.fyers_auth import (
    get_login_url,
    exchange_auth_code,
    save_manual_token,
    logout_user,
    fetch_and_cache_profile
)

router = APIRouter(prefix="/api/auth", tags=["Authentication"])

class AuthCodeRequest(BaseModel):
    auth_code: str

class ManualTokenRequest(BaseModel):
    access_token: str

@router.get("/login-url")
def get_auth_url(state: Optional[str] = "tradepro_login"):
    """
    Returns the official Fyers OAuth authorization URL.
    Open this in a browser tab to login and obtain the auth_code.
    """
    if not settings.FYERS_APP_ID or not settings.FYERS_SECRET_ID:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Fyers credentials (FYERS_APP_ID / FYERS_SECRET_ID) are missing from configuration."
        )
    url = get_login_url(state=state)
    return {
        "status": "success",
        "login_url": url,
        "client_id": settings.FYERS_APP_ID,
        "redirect_uri": settings.FYERS_REDIRECT_URI
    }

@router.post("/callback")
def process_auth_callback(payload: AuthCodeRequest):
    """
    Exchanges the authorization code received from Fyers OAuth redirect for an access token.
    """
    if not payload.auth_code:
        raise HTTPException(status_code=400, detail="auth_code is required")
    
    result = exchange_auth_code(payload.auth_code.strip())
    if not result.get("success"):
        raise HTTPException(
            status_code=400,
            detail=result.get("error", "Failed to exchange auth_code for access token")
        )
    return result

@router.post("/manual-token")
def set_manual_token(payload: ManualTokenRequest):
    """
    Validates and stores an already generated Fyers access token directly.
    """
    if not payload.access_token:
        raise HTTPException(status_code=400, detail="access_token is required")
    
    result = save_manual_token(payload.access_token.strip())
    if not result.get("success"):
        raise HTTPException(
            status_code=400,
            detail=result.get("error", "Token verification failed. Please verify the token is active.")
        )
    return result

@router.get("/status")
def check_auth_status():
    """
    Checks if the user has an active, valid session with Fyers.
    """
    token = get_fyers_token()
    if not token:
        return {
            "authenticated": False,
            "user": None,
            "app_id": settings.FYERS_APP_ID,
            "redirect_uri": settings.FYERS_REDIRECT_URI
        }
    
    profile = get_cached_profile()
    if not profile:
        fresh = fetch_and_cache_profile(token)
        if fresh.get("s") == "ok":
            profile = fresh.get("data")
    
    return {
        "authenticated": True,
        "user": profile,
        "app_id": settings.FYERS_APP_ID,
        "redirect_uri": settings.FYERS_REDIRECT_URI
    }

@router.get("/me")
def get_current_user_profile():
    """
    Retrieves full details of the authenticated Fyers account.
    """
    token = get_fyers_token()
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User is not authenticated. Please log in with Fyers."
        )
    
    profile = get_cached_profile()
    if not profile:
        profile_res = fetch_and_cache_profile(token)
        if profile_res.get("s") == "ok":
            profile = profile_res.get("data")
        else:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail=profile_res.get("message", "Session expired or invalid token")
            )
    return {"status": "success", "profile": profile}

@router.post("/logout")
def logout():
    """
    Terminates the session and deletes stored tokens from cache.
    """
    return logout_user()
