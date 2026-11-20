"""A deliberately isolated paper-trading ledger.

Nothing in this router calls FYERS' order APIs.  Orders are filled against the
price supplied by the chart and stored only in this application's database.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Literal

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import DateTime, Float, Integer, String, create_engine, select
from sqlalchemy.orm import DeclarativeBase, Mapped, Session, mapped_column

from app.config import settings


STARTING_CASH = 1_000_000.0
router = APIRouter(prefix="/api/paper", tags=["Paper Trading"])


class Base(DeclarativeBase):
    pass


class Account(Base):
    __tablename__ = "paper_accounts"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    cash: Mapped[float] = mapped_column(Float, default=STARTING_CASH)


class Position(Base):
    __tablename__ = "paper_positions"
    symbol: Mapped[str] = mapped_column(String(80), primary_key=True)
    name: Mapped[str] = mapped_column(String(100))
    quantity: Mapped[int] = mapped_column(Integer, default=0)
    average_price: Mapped[float] = mapped_column(Float, default=0)
    realized_pnl: Mapped[float] = mapped_column(Float, default=0)


class PaperOrder(Base):
    __tablename__ = "paper_orders"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    symbol: Mapped[str] = mapped_column(String(80), index=True)
    name: Mapped[str] = mapped_column(String(100))
    side: Mapped[str] = mapped_column(String(4))
    quantity: Mapped[int] = mapped_column(Integer)
    price: Mapped[float] = mapped_column(Float)
    product_type: Mapped[str] = mapped_column(String(32))
    realized_pnl: Mapped[float] = mapped_column(Float, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))


# The project installs psycopg2-binary, so request that dialect explicitly.
# (A plain postgresql:// URL makes recent SQLAlchemy versions prefer psycopg.)
DATABASE_URL = settings.DATABASE_URL.replace("postgresql://", "postgresql+psycopg2://", 1)
engine = create_engine(DATABASE_URL, pool_pre_ping=True)


class OrderRequest(BaseModel):
    symbol: str = Field(min_length=1, max_length=80)
    name: str = Field(min_length=1, max_length=100)
    side: Literal["buy", "sell"]
    quantity: int = Field(gt=0, le=100_000)
    price: float = Field(gt=0)
    product_type: str = Field(default="Intraday", max_length=32)


def _account(session: Session) -> Account:
    account = session.get(Account, 1)
    if account is None:
        account = Account(id=1, cash=STARTING_CASH)
        session.add(account)
        session.flush()
    return account


def _position_data(position: Position) -> dict:
    return {
        "symbol": position.symbol,
        "name": position.name,
        "quantity": position.quantity,
        "average_price": round(position.average_price, 2),
        "realized_pnl": round(position.realized_pnl, 2),
    }


@router.on_event("startup")
def create_paper_tables() -> None:
    Base.metadata.create_all(engine)


@router.get("/portfolio")
def portfolio():
    with Session(engine) as session:
        account = _account(session)
        positions = session.scalars(select(Position).where(Position.quantity != 0).order_by(Position.name)).all()
        session.commit()
        return {
            "starting_cash": STARTING_CASH,
            "cash": round(account.cash, 2),
            "positions": [_position_data(p) for p in positions],
        }


@router.post("/orders")
def place_order(order: OrderRequest):
    """Fill a paper market order immediately at the chart's displayed price."""
    with Session(engine) as session:
        account = _account(session)
        cost = order.quantity * order.price
        if order.side == "buy" and cost > account.cash:
            raise HTTPException(status_code=400, detail="Insufficient virtual cash for this paper order.")

        position = session.get(Position, order.symbol)
        if position is None:
            position = Position(symbol=order.symbol, name=order.name, quantity=0, average_price=0, realized_pnl=0)
            session.add(position)

        old_qty, old_avg = position.quantity, position.average_price
        delta = order.quantity if order.side == "buy" else -order.quantity
        new_qty = old_qty + delta
        realized = 0.0
        if old_qty and (old_qty > 0) != (delta > 0):
            closed = min(abs(old_qty), abs(delta))
            realized = closed * (order.price - old_avg) * (1 if old_qty > 0 else -1)

        if old_qty == 0 or (old_qty > 0) == (delta > 0):
            total_qty = abs(old_qty) + abs(delta)
            position.average_price = ((abs(old_qty) * old_avg) + (abs(delta) * order.price)) / total_qty
        elif new_qty == 0:
            position.average_price = 0
        elif (new_qty > 0) != (old_qty > 0):
            position.average_price = order.price
        position.quantity = new_qty
        position.name = order.name
        position.realized_pnl += realized
        account.cash += -cost if order.side == "buy" else cost

        record = PaperOrder(
            symbol=order.symbol, name=order.name, side=order.side, quantity=order.quantity,
            price=order.price, product_type=order.product_type, realized_pnl=realized,
        )
        session.add(record)
        session.commit()
        session.refresh(account)
        return {
            "message": f"Paper {order.side} filled at ₹{order.price:.2f}",
            "order": {"id": record.id, "price": round(order.price, 2), "realized_pnl": round(realized, 2)},
            "cash": round(account.cash, 2),
            "position": _position_data(position),
        }
