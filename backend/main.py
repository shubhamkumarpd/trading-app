import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.routers import auth, user, market, paper, stream

app = FastAPI(
    title="TradePro API",
    version="1.0.0",
    description="Algorithmic & Manual Trading API integrated with Fyers"
)

# CORS setup for Next.js frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount routers
app.include_router(auth.router)
app.include_router(user.router)
app.include_router(market.router)
app.include_router(paper.router)
app.include_router(stream.router)

@app.get("/")
def read_root():
    return {
        "status": "online",
        "service": "TradePro Backend",
        "version": "1.0.0",
        "fyers_configured": bool(os.getenv("FYERS_APP_ID"))
    }

@app.get("/health")
def health_check():
    return {"status": "healthy"}
