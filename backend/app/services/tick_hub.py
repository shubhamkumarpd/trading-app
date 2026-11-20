"""Real-time price fan-out.

One shared FYERS data-socket (or a built-in simulator when nobody is logged in) feeds every browser that
is connected to /ws/ticks. Browsers never talk to FYERS directly and the access token never leaves the server.

Threading: the FYERS socket calls our callbacks from its own thread, so every callback only hands the message
to the asyncio loop with call_soon_threadsafe. All hub state is touched on the loop thread only.
"""
from __future__ import annotations

import asyncio
import logging
import random
import time
from typing import Any, Dict, Optional, Set

from app.config import settings
from app.redis_client import get_fyers_token

log = logging.getLogger("tick_hub")

QUEUE_MAX = 200


def normalize(msg: Any) -> Optional[Dict[str, Any]]:
    """Turn a FYERS SymbolUpdate message into the small tick we send to browsers (None = not a price tick)."""
    if not isinstance(msg, dict):
        return None
    sym = msg.get("symbol")
    ltp = msg.get("ltp")
    if not sym or ltp is None:
        return None
    try:
        price = float(ltp)
    except (TypeError, ValueError):
        return None
    if price <= 0:
        return None
    ts = 0
    for key in ("last_traded_time", "exch_feed_time"):
        try:
            ts = int(msg.get(key) or 0)
        except (TypeError, ValueError):
            ts = 0
        if ts > 0:
            break
    if ts <= 0:
        ts = int(time.time())
    tick: Dict[str, Any] = {"type": "tick", "symbol": sym, "ltp": price, "ts": ts, "live": True}
    for src, dst in (("ch", "ch"), ("chp", "chp"), ("prev_close_price", "prev_close")):
        v = msg.get(src)
        if isinstance(v, (int, float)):
            tick[dst] = float(v)
    return tick


class TickHub:
    def __init__(self) -> None:
        self._queues: Set[asyncio.Queue] = set()
        self._subs: Dict[str, Set[asyncio.Queue]] = {}
        self._last: Dict[str, Dict[str, Any]] = {}
        self._loop: Optional[asyncio.AbstractEventLoop] = None
        self._socket: Any = None
        self._socket_token: Optional[str] = None
        self._socket_ready = False
        self._demo_task: Optional[asyncio.Task] = None
        self._mode = "demo"
        self._lock: Optional[asyncio.Lock] = None

    # ---------- client registration ----------

    def register(self, q: asyncio.Queue) -> None:
        self._queues.add(q)

    async def unregister(self, q: asyncio.Queue) -> None:
        self._queues.discard(q)
        for sym in list(self._subs):
            await self.unsubscribe(q, [sym])

    @property
    def mode(self) -> str:
        return self._mode

    async def subscribe(self, q: asyncio.Queue, symbols: list[str]) -> str:
        self._loop = asyncio.get_running_loop()
        if self._lock is None:
            self._lock = asyncio.Lock()
        new: list[str] = []
        for sym in symbols:
            subs = self._subs.setdefault(sym, set())
            if not subs:
                new.append(sym)
            subs.add(q)
        async with self._lock:
            await self._ensure_source(new)
        for sym in symbols:
            last = self._last.get(sym)
            if last:
                self._put(q, last)
        return self._mode

    async def unsubscribe(self, q: asyncio.Queue, symbols: list[str]) -> None:
        gone: list[str] = []
        for sym in symbols:
            subs = self._subs.get(sym)
            if not subs:
                continue
            subs.discard(q)
            if not subs:
                del self._subs[sym]
                self._last.pop(sym, None)
                gone.append(sym)
        if gone and self._socket is not None and self._socket_ready:
            await self._run_blocking(self._socket.unsubscribe, symbols=gone, data_type="SymbolUpdate")
        if not self._subs:
            self._stop_demo()

    # ---------- delivery ----------

    @staticmethod
    def _put(q: asyncio.Queue, item: Dict[str, Any]) -> None:
        if q.full():  # slow browser: drop the oldest tick, a newer price makes it obsolete
            try:
                q.get_nowait()
            except asyncio.QueueEmpty:
                pass
        try:
            q.put_nowait(item)
        except asyncio.QueueFull:
            pass

    def _dispatch(self, tick: Dict[str, Any]) -> None:
        self._last[tick["symbol"]] = tick
        for q in list(self._subs.get(tick["symbol"], ())):
            self._put(q, tick)

    def _broadcast_status(self) -> None:
        msg = {"type": "status", "mode": self._mode}
        for q in list(self._queues):
            self._put(q, msg)

    def _set_mode(self, mode: str) -> None:
        if mode != self._mode:
            self._mode = mode
            self._broadcast_status()

    async def _run_blocking(self, fn, *args, **kwargs):
        loop = asyncio.get_running_loop()
        try:
            return await loop.run_in_executor(None, lambda: fn(*args, **kwargs))
        except Exception:
            log.exception("fyers socket call failed")
            return None

    # ---------- choosing the source ----------

    async def _ensure_source(self, new_symbols: list[str]) -> None:
        token = await self._run_blocking(get_fyers_token)

        if token and settings.FYERS_APP_ID:
            self._stop_demo()
            if self._socket is not None and token != self._socket_token:
                await self._close_socket()  # logged in again: old socket has a dead token
            if self._socket is None:
                await self._open_socket(token)
            elif new_symbols and self._socket_ready:
                await self._run_blocking(self._socket.subscribe, symbols=new_symbols, data_type="SymbolUpdate")
            return

        # nobody is logged in (or the token was cleared): simulated ticks so the UI can be developed and tested
        if self._socket is not None:
            await self._close_socket()
        self._set_mode("demo")
        if self._demo_task is None or self._demo_task.done():
            self._demo_task = asyncio.create_task(self._demo_loop())

    async def _open_socket(self, token: str) -> None:
        from fyers_apiv3.FyersWebsocket import data_ws

        loop = self._loop
        assert loop is not None
        self._socket_token = token
        self._socket_ready = False
        self._set_mode("reconnecting")

        def on_message(msg):
            tick = normalize(msg)
            if tick:
                loop.call_soon_threadsafe(self._dispatch, tick)

        def on_connect():
            def ready():
                self._socket_ready = True
                self._set_mode("live")
                symbols = list(self._subs)
                if symbols and self._socket is not None:
                    self._socket.subscribe(symbols=symbols, data_type="SymbolUpdate")
            loop.call_soon_threadsafe(lambda: asyncio.ensure_future(self._run_blocking(ready)))

        def on_close(_msg=None):
            loop.call_soon_threadsafe(self._on_socket_closed)

        def on_error(msg=None):
            log.warning("fyers socket error: %s", msg)
            loop.call_soon_threadsafe(self._on_socket_closed)

        sock = data_ws.FyersDataSocket(
            access_token=f"{settings.FYERS_APP_ID}:{token}",
            log_path="",
            litemode=False,
            write_to_file=False,
            reconnect=True,
            on_connect=on_connect,
            on_message=on_message,
            on_error=on_error,
            on_close=on_close,
        )
        self._socket = sock
        await self._run_blocking(sock.connect)

    def _on_socket_closed(self) -> None:
        self._socket_ready = False
        if self._socket is not None:
            self._set_mode("reconnecting")

    async def _close_socket(self) -> None:
        sock, self._socket, self._socket_token, self._socket_ready = self._socket, None, None, False
        if sock is not None:
            await self._run_blocking(sock.close_connection)

    # ---------- simulator (not logged in) ----------

    def _stop_demo(self) -> None:
        if self._demo_task is not None and not self._demo_task.done():
            self._demo_task.cancel()
        self._demo_task = None

    async def _demo_loop(self) -> None:
        from app.routers.market import _demo_candles  # local import: market imports nothing from here

        prices: Dict[str, float] = {}
        rnd = random.Random()
        try:
            while self._subs:
                for sym in list(self._subs):
                    if sym not in prices:
                        candles = _demo_candles(sym, "1", 1)
                        prices[sym] = candles[-1]["close"] if candles else 1000.0
                    prices[sym] = round(max(0.05, prices[sym] * (1 + rnd.gauss(0, 0.00015))), 2)
                    self._dispatch({"type": "tick", "symbol": sym, "ltp": prices[sym], "ts": int(time.time()), "live": False})
                await asyncio.sleep(0.5)
        except asyncio.CancelledError:
            pass


hub = TickHub()
