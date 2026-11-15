import os
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    FYERS_APP_ID: str = os.getenv("FYERS_APP_ID", "")
    FYERS_SECRET_ID: str = os.getenv("FYERS_SECRET_ID", "")
    FYERS_REDIRECT_URI: str = os.getenv("FYERS_REDIRECT_URI", "https://trade.fyers.in/api-login/redirect-uri/index.html")
    
    REDIS_URL: str = os.getenv("REDIS_URL", "redis://redis:6379/0")
    DATABASE_URL: str = os.getenv("DATABASE_URL", "postgresql://trading_user:trading_pass@postgres:5432/trading_db")
    
    JWT_SECRET: str = os.getenv("JWT_SECRET", "super-secret-tradepro-key-1cr-budget")

    class Config:
        env_file = ".env"
        extra = "allow"

settings = Settings()
