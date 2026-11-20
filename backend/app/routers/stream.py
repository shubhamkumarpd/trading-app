import asyncio
from typing import Any, List

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.services.tick_hub import QUEUE_MAX, hub

router = APIRouter(tags=["stream"])

MAX_SYMBOLS = 20


def _symbols(msg: Any) -> List[str]:
    raw = msg.get("symbols") if isinstance(msg, dict) else None
    if not isinstance(raw, list):
        return []
    return [s for s in raw if isinstance(s, str) and 0 < len(s) < 64][:MAX_SYMBOLS]


@router.websocket("/ws/ticks")
async def ticks(ws: WebSocket):
    """Live prices. Client sends {"action":"subscribe","symbols":[...]} / {"action":"unsubscribe",...} / {"action":"ping"}.
    Server sends {"type":"tick",...}, {"type":"status","mode":"live|demo|reconnecting"} and {"type":"pong"}.
    """
    await ws.accept()
    q: asyncio.Queue = asyncio.Queue(maxsize=QUEUE_MAX)
    hub.register(q)

    async def reader() -> None:
        while True:
            msg = await ws.receive_json()
            action = msg.get("action") if isinstance(msg, dict) else None
            if action == "subscribe":
                mode = await hub.subscribe(q, _symbols(msg))
                q.put_nowait({"type": "status", "mode": mode})
            elif action == "unsubscribe":
                await hub.unsubscribe(q, _symbols(msg))
            elif action == "ping":
                q.put_nowait({"type": "pong"})

    async def writer() -> None:
        while True:
            await ws.send_json(await q.get())

    tasks = [asyncio.create_task(reader()), asyncio.create_task(writer())]
    try:
        await asyncio.wait(tasks, return_when=asyncio.FIRST_COMPLETED)
    except WebSocketDisconnect:
        pass
    finally:
        for t in tasks:
            t.cancel()
        await hub.unregister(q)
