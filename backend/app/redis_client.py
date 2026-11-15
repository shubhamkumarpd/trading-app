import redis
import json
from typing import Optional, Dict, Any
from app.config import settings

redis_conn = redis.from_url(settings.REDIS_URL, decode_responses=True)

TOKEN_KEY = "fyers:access_token"
PROFILE_KEY = "fyers:user_profile"

def set_fyers_token(token: str, expire_seconds: int = 86400) -> None:
    redis_conn.set(TOKEN_KEY, token, ex=expire_seconds)

def get_fyers_token() -> Optional[str]:
    return redis_conn.get(TOKEN_KEY)

def set_cached_profile(profile_data: Dict[str, Any], expire_seconds: int = 86400) -> None:
    redis_conn.set(PROFILE_KEY, json.dumps(profile_data), ex=expire_seconds)

def get_cached_profile() -> Optional[Dict[str, Any]]:
    data = redis_conn.get(PROFILE_KEY)
    if data:
        try:
            return json.loads(data)
        except Exception:
            return None
    return None

def clear_fyers_session() -> None:
    redis_conn.delete(TOKEN_KEY)
    redis_conn.delete(PROFILE_KEY)
