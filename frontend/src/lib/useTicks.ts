"use client";

import { useEffect, useRef, useState } from "react";

export interface Tick {
  symbol: string;
  ltp: number;
  /** unix seconds */
  ts: number;
  prev_close?: number;
  live: boolean;
}

/** connecting: no answer yet · live: real FYERS ticks · demo: simulated (not logged in) · reconnecting: feed dropped · offline: our socket is down */
export type TickStatus = "connecting" | "live" | "demo" | "reconnecting" | "offline";

function wsUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_WS_URL;
  const base = explicit || (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000").replace(/^http/, "ws");
  return `${base.replace(/\/$/, "")}/ws/ticks`;
}

const STALE_MS = 20_000; // no message at all for this long: the connection is dead, reconnect
const PING_MS = 10_000;

/**
 * Subscribes to live ticks for one symbol. `onTick` is called for every tick (keep it cheap);
 * it is held in a ref so changing it never reconnects. Reconnects with back-off by itself.
 */
export function useTicks(symbol: string, onTick: (t: Tick) => void): TickStatus {
  const [status, setStatus] = useState<TickStatus>("connecting");
  const onTickRef = useRef(onTick);
  onTickRef.current = onTick;
  const symbolRef = useRef(symbol);
  const wsRef = useRef<WebSocket | null>(null);

  // one connection for the lifetime of the page
  useEffect(() => {
    let closed = false;
    let retry = 0;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let beat: ReturnType<typeof setInterval> | null = null;
    let lastMsg = Date.now();

    const connect = () => {
      if (closed) return;
      setStatus((s) => (s === "live" || s === "demo" ? "reconnecting" : "connecting"));
      let ws: WebSocket;
      try {
        ws = new WebSocket(wsUrl());
      } catch {
        schedule();
        return;
      }
      wsRef.current = ws;

      ws.onopen = () => {
        retry = 0;
        lastMsg = Date.now();
        ws.send(JSON.stringify({ action: "subscribe", symbols: [symbolRef.current] }));
        beat = setInterval(() => {
          if (ws.readyState !== WebSocket.OPEN) return;
          if (Date.now() - lastMsg > STALE_MS) {
            ws.close();
            return;
          }
          ws.send(JSON.stringify({ action: "ping" }));
        }, PING_MS);
      };

      ws.onmessage = (ev) => {
        lastMsg = Date.now();
        let m: any;
        try {
          m = JSON.parse(ev.data);
        } catch {
          return;
        }
        if (m.type === "tick") {
          if (m.symbol !== symbolRef.current) return; // late tick of the previous symbol
          onTickRef.current({ symbol: m.symbol, ltp: m.ltp, ts: m.ts, prev_close: m.prev_close, live: !!m.live });
          setStatus((s) => {
            const next = m.live ? "live" : "demo";
            return s === next ? s : next;
          });
        } else if (m.type === "status") {
          if (m.mode === "reconnecting") setStatus("reconnecting");
          else if (m.mode === "demo") setStatus("demo");
          else if (m.mode === "live") setStatus("live");
        }
      };

      ws.onclose = () => {
        if (beat) clearInterval(beat);
        beat = null;
        if (wsRef.current === ws) wsRef.current = null;
        if (closed) return;
        setStatus("offline");
        schedule();
      };
      ws.onerror = () => ws.close();
    };

    const schedule = () => {
      if (closed || timer) return;
      const wait = Math.min(10_000, 500 * 2 ** retry++);
      timer = setTimeout(() => {
        timer = null;
        connect();
      }, wait);
    };

    connect();
    return () => {
      closed = true;
      if (timer) clearTimeout(timer);
      if (beat) clearInterval(beat);
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, []);

  // symbol switch on the same connection
  useEffect(() => {
    const prev = symbolRef.current;
    symbolRef.current = symbol;
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN && prev !== symbol) {
      ws.send(JSON.stringify({ action: "unsubscribe", symbols: [prev] }));
      ws.send(JSON.stringify({ action: "subscribe", symbols: [symbol] }));
    }
  }, [symbol]);

  return status;
}
