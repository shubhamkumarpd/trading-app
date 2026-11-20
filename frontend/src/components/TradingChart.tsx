"use client";

import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import {
  AreaSeries,
  CandlestickSeries,
  ColorType,
  CrosshairMode,
  HistogramSeries,
  LineSeries,
  LineStyle,
  PriceScaleMode,
  TickMarkType,
  createChart,
  type IChartApi,
  type IPriceLine,
  type ISeriesApi,
  type MouseEventParams,
  type SeriesType,
  type Time,
} from "lightweight-charts";
import type { CandleItem } from "@/lib/api";
import {
  bollinger,
  ema,
  heikinAshi,
  macd,
  rsi,
  sma,
  supertrend,
  vwap,
  type Num,
} from "@/lib/indicators";

/* ───────────────────────── public types / catalog ───────────────────────── */

export type ChartKind = "candle" | "heikin" | "area" | "line";
export type DrawTool = "crosshair" | "horizontal" | "trendline" | "measure";
export type RangeKey = "1D" | "5D" | "1M" | "3M" | "6M" | "1Y" | "ALL";

export interface IndicatorDef {
  id: string;
  label: string;
  group: "overlay" | "pane";
  color: string;
}

/** Same order as the Indicators menu. Overlays draw on the price pane, panes get their own area below it. */
export const INDICATOR_CATALOG: IndicatorDef[] = [
  { id: "ema9", label: "EMA 9", group: "overlay", color: "#38bdf8" },
  { id: "ema21", label: "EMA 21", group: "overlay", color: "#f59e0b" },
  { id: "ema50", label: "EMA 50", group: "overlay", color: "#ec4899" },
  { id: "ema200", label: "EMA 200", group: "overlay", color: "#a3e635" },
  { id: "sma20", label: "SMA 20", group: "overlay", color: "#e879f9" },
  { id: "sma50", label: "SMA 50", group: "overlay", color: "#fb923c" },
  { id: "bb", label: "Bollinger Bands 20, 2", group: "overlay", color: "#8b5cf6" },
  { id: "vwap", label: "VWAP", group: "overlay", color: "#facc15" },
  { id: "supertrend", label: "Supertrend 10, 3", group: "overlay", color: "#22c55e" },
  { id: "volume", label: "Volume", group: "pane", color: "#64748b" },
  { id: "rsi", label: "RSI 14", group: "pane", color: "#a78bfa" },
  { id: "macd", label: "MACD 12, 26, 9", group: "pane", color: "#38bdf8" },
];

export const DEFAULT_INDICATORS: Record<string, boolean> = {
  ema9: true,
  ema21: true,
  ema50: false,
  ema200: false,
  sma20: false,
  sma50: false,
  bb: false,
  vwap: false,
  supertrend: false,
  volume: true,
  rsi: true,
  macd: false,
};

export interface TradingChartHandle {
  screenshot: () => string | null;
  /** factor < 1 stretches candles (zoom in), > 1 makes them smaller (zoom out) */
  zoom: (factor: number) => void;
  /** factor < 1 stretches the price scale (taller candles), > 1 compresses it */
  zoomPrice: (factor: number) => void;
  /** move the view by this many bars (negative = back in time) */
  pan: (bars: number) => void;
  /** live price: updates the forming candle (or opens the next one) and all indicators, without touching the view */
  applyTick: (price: number, tsSeconds: number) => void;
  resetView: () => void;
  undoDrawing: () => void;
  clearDrawings: () => void;
}

interface Props {
  candles: CandleItem[];
  /** changes only when the dataset itself changes (symbol / timeframe / range), not on live refresh */
  datasetKey: string;
  /** drawings are cleared when this changes (symbol + timeframe) */
  drawingsKey: string;
  symbolName: string;
  resolutionLabel: string;
  /** FYERS resolution: minutes as a string ("15", "60") or "D" / "1D" */
  resolution: string;
  range: RangeKey;
  chartKind: ChartKind;
  indicators: Record<string, boolean>;
  onToggleIndicator: (id: string) => void;
  isLog: boolean;
  autoScale: boolean;
  magnet: boolean;
  isDaily: boolean;
  tool: DrawTool;
  onToolDone: () => void;
  /** called when the user takes manual control of the price scale (shift+wheel, price-axis buttons) */
  onAutoScaleChange?: (auto: boolean) => void;
}

/* ───────────────────────────── helpers ───────────────────────────── */

const IST = "Asia/Kolkata";
const IST_OFFSET = 19800;
const UP = "#10b981";
const DOWN = "#f43f5e";
const TEXT = "#94a3b8";

const fmtHM = new Intl.DateTimeFormat("en-GB", { timeZone: IST, hour: "2-digit", minute: "2-digit", hour12: false });
const fmtDM = new Intl.DateTimeFormat("en-GB", { timeZone: IST, day: "numeric", month: "short" });
const fmtMon = new Intl.DateTimeFormat("en-GB", { timeZone: IST, month: "short" });
const fmtYear = new Intl.DateTimeFormat("en-GB", { timeZone: IST, year: "numeric" });
const fmtFull = new Intl.DateTimeFormat("en-GB", {
  timeZone: IST,
  weekday: "short",
  day: "2-digit",
  month: "short",
  year: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});
const fmtFullDay = new Intl.DateTimeFormat("en-GB", {
  timeZone: IST,
  weekday: "short",
  day: "2-digit",
  month: "short",
  year: "numeric",
});
const priceFmt = new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const volFmt = new Intl.NumberFormat("en-IN", { notation: "compact", maximumFractionDigits: 2 });

const num = (v: number | null | undefined, f = priceFmt) => (v === null || v === undefined || Number.isNaN(v) ? "—" : f.format(v));

/** lightweight-charts needs strictly ascending unique timestamps. */
function sanitize(input: CandleItem[]): CandleItem[] {
  const sorted = [...input].filter((c) => Number.isFinite(c.time)).sort((a, b) => a.time - b.time);
  const out: CandleItem[] = [];
  for (const c of sorted) {
    if (out.length && out[out.length - 1].time === c.time) out[out.length - 1] = c;
    else out.push(c);
  }
  return out;
}

function toLine(times: number[], values: Num[]) {
  return times.map((t, i) => (values[i] === null ? { time: t as Time } : { time: t as Time, value: values[i] as number }));
}

function firstVisibleIndex(cs: CandleItem[], range: RangeKey): number {
  if (!cs.length || range === "ALL") return 0;
  const last = cs[cs.length - 1].time;
  let idx = 0;
  if (range === "1D") {
    const day = Math.floor((last + IST_OFFSET) / 86400);
    idx = cs.findIndex((c) => Math.floor((c.time + IST_OFFSET) / 86400) === day);
  } else {
    const days = { "5D": 5, "1M": 30, "3M": 90, "6M": 180, "1Y": 365 }[range];
    idx = cs.findIndex((c) => c.time >= last - days * 86400);
  }
  if (idx < 0) idx = 0;
  // keep some context even on a short session
  return Math.max(0, Math.min(idx, cs.length - 70));
}

type Drawing =
  | { kind: "h"; price: number; handle: IPriceLine | null }
  | { kind: "line"; series: ISeriesApi<SeriesType> };

interface Reg {
  id: string;
  pane: "main" | "rsi" | "macd";
  label: string;
  color: string;
  kind: "line" | "hist";
  series: ISeriesApi<SeriesType>;
  compute: (cs: CandleItem[], closes: number[], times: number[]) => any[];
}

interface LegendRow {
  label: string;
  color: string;
  value: string;
  removeId?: string;
}

interface LegendState {
  headline: { text: string; change: string; up: boolean } | null;
  main: LegendRow[];
  rsi: LegendRow[];
  macd: LegendRow[];
  tops: { rsi: number; macd: number };
}

const EMPTY_LEGEND: LegendState = { headline: null, main: [], rsi: [], macd: [], tops: { rsi: 0, macd: 0 } };

/* ───────────────────────────── component ───────────────────────────── */

export const TradingChart = forwardRef<TradingChartHandle, Props>(function TradingChart(props, ref) {
  const {
    candles,
    datasetKey,
    drawingsKey,
    symbolName,
    resolutionLabel,
    resolution,
    range,
    chartKind,
    indicators,
    onToggleIndicator,
    isLog,
    autoScale,
    magnet,
    isDaily,
    tool,
    onToolDone,
    onAutoScaleChange,
  } = props;

  const wrapRef = useRef<HTMLDivElement | null>(null);
  const hostRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const mainRef = useRef<ISeriesApi<SeriesType> | null>(null);
  const regsRef = useRef<Reg[]>([]);
  const drawingsRef = useRef<Drawing[]>([]);
  const pendingRef = useRef<{ kind: "trendline" | "measure"; time: number; price: number; series: ISeriesApi<SeriesType>; last?: string } | null>(null);
  const previewBusyRef = useRef(false);

  const csRef = useRef<CandleItem[]>([]);
  const timeIdxRef = useRef<Map<number, number>>(new Map());
  const appliedKeyRef = useRef<string>("");

  const toolRef = useRef(tool);
  const onToolDoneRef = useRef(onToolDone);
  const rangeRef = useRef(range);
  const onAutoScaleChangeRef = useRef(onAutoScaleChange);
  onAutoScaleChangeRef.current = onAutoScaleChange;
  const nameRef = useRef({ symbolName, resolutionLabel });
  toolRef.current = tool;
  onToolDoneRef.current = onToolDone;
  rangeRef.current = range;
  nameRef.current = { symbolName, resolutionLabel };

  const [legend, setLegend] = useState<LegendState>(EMPTY_LEGEND);
  const [measure, setMeasure] = useState<string | null>(null);
  const rafRef = useRef<number | null>(null);
  const lastParamRef = useRef<MouseEventParams<Time> | null>(null);

  const hasVolume = useMemo(() => candles.some((c) => c.volume > 0), [candles]);
  const enabledIds = Object.keys(indicators).filter((k) => indicators[k]);
  const structureKey = `${chartKind}|${enabledIds.join(",")}|${hasVolume}`;

  /* ---------- legend ---------- */

  const paneTop = (i: number): number => {
    const chart = chartRef.current;
    const wrap = wrapRef.current;
    if (!chart || !wrap) return 0;
    const el = chart.panes()[i]?.getHTMLElement();
    if (!el) return 0;
    return el.getBoundingClientRect().top - wrap.getBoundingClientRect().top;
  };

  const computeLegend = useCallback(() => {
    const chart = chartRef.current;
    const main = mainRef.current;
    if (!chart || !main) return;
    const param = lastParamRef.current;
    const cs = csRef.current;
    if (!cs.length) {
      setLegend(EMPTY_LEGEND);
      return;
    }

    const hoverTime = param?.time as number | undefined;
    const idx = hoverTime !== undefined ? timeIdxRef.current.get(hoverTime) : undefined;
    const i = idx !== undefined ? idx : cs.length - 1;
    const bar = cs[i];
    const prevClose = i > 0 ? cs[i - 1].close : bar.open;
    const chg = bar.close - prevClose;
    const pct = prevClose ? (chg / prevClose) * 100 : 0;

    const valueOf = (reg: Reg): number | null => {
      if (hoverTime !== undefined && param) {
        const d: any = param.seriesData.get(reg.series);
        return d && d.value !== undefined ? d.value : null;
      }
      const data: any[] = reg.series.data() as any[];
      for (let k = data.length - 1; k >= 0; k--) if (data[k].value !== undefined) return data[k].value;
      return null;
    };

    const rows: Record<"main" | "rsi" | "macd", LegendRow[]> = { main: [], rsi: [], macd: [] };
    for (const reg of regsRef.current) {
      const v = valueOf(reg);
      const isVol = reg.id === "volume";
      let valueText = isVol ? num(v, volFmt) : num(v);
      if (reg.id === "rsi") valueText = num(v);
      rows[reg.pane].push({
        label: reg.label,
        color: reg.color,
        value: valueText,
        removeId: reg.pane === "main" && !reg.id.endsWith("_b") ? reg.id.split("_")[0] : undefined,
      });
    }

    // Collapse multi-series indicators (Bollinger, Supertrend) into one legend row each.
    const merged: LegendRow[] = [];
    const seen = new Set<string>();
    for (const r of rows.main) {
      const key = r.removeId ?? r.label;
      if (r.removeId && seen.has(r.removeId)) continue;
      if (r.removeId) seen.add(r.removeId);
      merged.push(r);
    }

    const hasRsi = regsRef.current.some((r) => r.pane === "rsi");
    const hasMacd = regsRef.current.some((r) => r.pane === "macd");
    let next = 1;
    const rsiIdx = hasRsi ? next++ : -1;
    const macdIdx = hasMacd ? next++ : -1;

    setLegend({
      headline: {
        text: `${nameRef.current.symbolName} · ${nameRef.current.resolutionLabel}   O ${num(bar.open)}  H ${num(bar.high)}  L ${num(bar.low)}  C ${num(bar.close)}`,
        change: `${chg >= 0 ? "+" : ""}${num(chg)} (${chg >= 0 ? "+" : ""}${pct.toFixed(2)}%)`,
        up: chg >= 0,
      },
      main: merged,
      rsi: rows.rsi,
      macd: rows.macd,
      tops: { rsi: rsiIdx >= 0 ? paneTop(rsiIdx) : 0, macd: macdIdx >= 0 ? paneTop(macdIdx) : 0 },
    });
  }, []);

  const scheduleLegend = useCallback(() => {
    if (rafRef.current !== null) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      computeLegend();
    });
  }, [computeLegend]);

  /* ---------- chart creation (once) ---------- */

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const chart = createChart(host, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: "#07090f" },
        textColor: TEXT,
        fontSize: 11,
        attributionLogo: false,
        panes: { separatorColor: "rgba(255,255,255,0.10)", separatorHoverColor: "rgba(99,102,241,0.45)", enableResize: true },
      },
      grid: {
        vertLines: { color: "rgba(255,255,255,0.035)" },
        horzLines: { color: "rgba(255,255,255,0.035)" },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: "rgba(148,163,184,0.55)", style: LineStyle.Dashed, labelBackgroundColor: "#334155" },
        horzLine: { color: "rgba(148,163,184,0.55)", style: LineStyle.Dashed, labelBackgroundColor: "#334155" },
      },
      rightPriceScale: { borderColor: "rgba(255,255,255,0.08)", minimumWidth: 74 },
      timeScale: {
        borderColor: "rgba(255,255,255,0.08)",
        timeVisible: true,
        secondsVisible: false,
        rightOffset: 8,
        barSpacing: 8,
        minBarSpacing: 0.5,
        tickMarkFormatter: (time: Time, type: TickMarkType) => {
          const d = new Date((time as number) * 1000);
          switch (type) {
            case TickMarkType.Year:
              return fmtYear.format(d);
            case TickMarkType.Month:
              return fmtMon.format(d);
            case TickMarkType.DayOfMonth:
              return fmtDM.format(d);
            default:
              return fmtHM.format(d);
          }
        },
      },
      localization: {
        timeFormatter: (time: Time) => {
          const d = new Date((time as number) * 1000);
          return isDailyRef.current ? fmtFullDay.format(d) : fmtFull.format(d) + " IST";
        },
        priceFormatter: (p: number) => priceFmt.format(p),
      },
      // drag the chart = pan; drag the time axis = stretch candles; drag the price axis = stretch price;
      // double-click an axis = reset it. Wheel is handled by hand below.
      handleScale: { axisPressedMouseMove: { time: true, price: true }, axisDoubleClickReset: { time: true, price: true }, mouseWheel: false, pinch: true },
      handleScroll: { mouseWheel: false, pressedMouseMove: true, horzTouchDrag: true, vertTouchDrag: true },
      kineticScroll: { mouse: true, touch: true },
    });
    chartRef.current = chart;

    chart.subscribeCrosshairMove((param) => {
      lastParamRef.current = param;
      scheduleLegend();

      // live preview for trendline / measure
      const pending = pendingRef.current;
      const main = mainRef.current;
      if (pending && main && param.point && param.time !== undefined && (param.paneIndex === undefined || param.paneIndex === 0)) {
        const price = main.coordinateToPrice(param.point.y);
        const t = param.time as number;
        // setData itself triggers another crosshair event, so only redraw when the point really moved
        const key = `${t}|${price?.toFixed(4)}`;
        if (price !== null && t !== pending.time && !previewBusyRef.current && pending.last !== key) {
          pending.last = key;
          const pts = t > pending.time ? [{ time: pending.time as Time, value: pending.price }, { time: t as Time, value: price }] : [{ time: t as Time, value: price }, { time: pending.time as Time, value: pending.price }];
          previewBusyRef.current = true;
          try {
            pending.series.setData(pts as any);
          } finally {
            previewBusyRef.current = false;
          }
        }
      }
    });

    chart.subscribeClick((param) => {
      const t = toolRef.current;
      const main = mainRef.current;
      if (t === "crosshair" || !main || !param.point) return;
      if (param.paneIndex !== undefined && param.paneIndex !== 0) return;
      const price = main.coordinateToPrice(param.point.y);
      if (price === null) return;

      if (t === "horizontal") {
        const handle = main.createPriceLine({
          price,
          color: "#f59e0b",
          lineWidth: 1,
          lineStyle: LineStyle.Dashed,
          axisLabelVisible: true,
          title: "",
        });
        drawingsRef.current.push({ kind: "h", price, handle });
        onToolDoneRef.current();
        return;
      }

      const time = param.time as number | undefined;
      if (time === undefined) return; // clicked right of the last candle

      const pending = pendingRef.current;
      if (!pending) {
        if (t === "measure") clearMeasure();
        const series = chart.addSeries(
          LineSeries,
          {
            color: t === "measure" ? "#94a3b8" : "#38bdf8",
            lineWidth: 2,
            lineStyle: t === "measure" ? LineStyle.Dashed : LineStyle.Solid,
            priceLineVisible: false,
            lastValueVisible: false,
            crosshairMarkerVisible: false,
          },
          0
        );
        pendingRef.current = { kind: t, time, price, series };
        return;
      }

      if (time === pending.time) return;
      const [a, b] = time > pending.time ? [{ time: pending.time, price: pending.price }, { time, price }] : [{ time, price }, { time: pending.time, price: pending.price }];
      pending.series.setData([
        { time: a.time as Time, value: a.price },
        { time: b.time as Time, value: b.price },
      ] as any);

      if (pending.kind === "measure") {
        const diff = price - pending.price;
        const pct = pending.price ? (diff / pending.price) * 100 : 0;
        const i1 = timeIdxRef.current.get(pending.time) ?? 0;
        const i2 = timeIdxRef.current.get(time) ?? 0;
        pending.series.applyOptions({ color: diff >= 0 ? UP : DOWN });
        setMeasure(`${diff >= 0 ? "+" : ""}${priceFmt.format(diff)} (${diff >= 0 ? "+" : ""}${pct.toFixed(2)}%)   ${Math.abs(i2 - i1)} bars`);
        measureSeriesRef.current = pending.series;
      } else {
        drawingsRef.current.push({ kind: "line", series: pending.series });
      }
      pendingRef.current = null;
      onToolDoneRef.current();
    });

    const ro = new ResizeObserver(() => scheduleLegend());
    if (wrapRef.current) ro.observe(wrapRef.current);

    // Wheel         = zoom candles (stretch / shrink) around the pointer
    // Shift + wheel = stretch the price scale up/down around the pointer
    // Sideways wheel (trackpad) = pan
    // The page does not scroll while the pointer is over the chart.
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const ts = chart.timeScale();
      const rect = host.getBoundingClientRect();

      if (Math.abs(e.deltaX) > Math.abs(e.deltaY) && !e.shiftKey) {
        const r0 = ts.getVisibleLogicalRange();
        if (r0) {
          const shift = (e.deltaX / Math.max(1, rect.width)) * (r0.to - r0.from);
          ts.setVisibleLogicalRange({ from: r0.from + shift, to: r0.to + shift });
        }
        return;
      }

      const zoomIn = (e.shiftKey ? e.deltaX || e.deltaY : e.deltaY) < 0;
      const factor = zoomIn ? 0.85 : 1 / 0.85;

      if (e.shiftKey) {
        const ps = mainRef.current?.priceScale();
        const main = mainRef.current;
        const r = ps?.getVisibleRange();
        if (!ps || !main || !r) return;
        const anchor = main.coordinateToPrice(e.clientY - rect.top) ?? (r.from + r.to) / 2;
        const ratio = (anchor - r.from) / (r.to - r.from || 1);
        const h = (r.to - r.from) * factor;
        ps.applyOptions({ autoScale: false });
        ps.setVisibleRange({ from: anchor - h * ratio, to: anchor + h * (1 - ratio) });
        onAutoScaleChangeRef.current?.(false);
        return;
      }

      const r = ts.getVisibleLogicalRange();
      if (!r) return;
      const w = (r.to - r.from) * factor;
      const anchor = ts.coordinateToLogical(e.clientX - rect.left) ?? r.to;
      const ratio = (anchor - r.from) / (r.to - r.from || 1);
      ts.setVisibleLogicalRange({ from: anchor - w * ratio, to: anchor + w * (1 - ratio) });
    };
    host.addEventListener("wheel", onWheel, { passive: false });

    // Keyboard: arrows pan, + / - zoom candles, Shift + arrows stretch price
    host.tabIndex = 0;
    host.style.outline = "none";
    const onKey = (e: KeyboardEvent) => {
      const ts = chart.timeScale();
      const r = ts.getVisibleLogicalRange();
      if (!r) return;
      const width = r.to - r.from;
      if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
        const s = (e.key === "ArrowLeft" ? -1 : 1) * Math.max(1, width * 0.1);
        ts.setVisibleLogicalRange({ from: r.from + s, to: r.to + s });
      } else if (e.key === "+" || e.key === "=") {
        ts.setVisibleLogicalRange({ from: r.to - width * 0.85, to: r.to });
      } else if (e.key === "-" || e.key === "_") {
        ts.setVisibleLogicalRange({ from: r.to - width / 0.85, to: r.to });
      } else if (e.key === "Home") {
        ts.setVisibleLogicalRange({ from: -2, to: -2 + width });
      } else if (e.key === "End") {
        ts.setVisibleLogicalRange({ from: csRef.current.length - 1 + 8 - width, to: csRef.current.length - 1 + 8 });
      } else return;
      e.preventDefault();
    };
    host.addEventListener("keydown", onKey);

    // Drag the chart up/down: the library only moves the price scale when auto-scale is off, so the moment
    // the user drags vertically we switch auto-scale off (the "auto" button follows) and the chart then
    // follows the mouse in both directions. Dragging the price axis itself is left to the library.
    const AXIS_W = 74;
    let press: { x: number; y: number } | null = null;
    const onPointerDown = (e: PointerEvent) => {
      const rect = host.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const onPriceAxis = x > rect.width - AXIS_W;
      const onTimeAxis = y > rect.height - 28;
      press = e.button === 0 && !onPriceAxis && !onTimeAxis && toolRef.current === "crosshair" ? { x, y } : null;
      host.focus({ preventScroll: true });
    };
    const onPointerMove = (e: PointerEvent) => {
      if (!press || !(e.buttons & 1)) return;
      const rect = host.getBoundingClientRect();
      if (Math.abs(e.clientY - rect.top - press.y) < 3) return;
      press = null;
      const ps = chart.priceScale("right", 0);
      if (ps.options().autoScale) {
        // freeze the current range first, otherwise the scale jumps when auto-scale turns off
        const r = ps.getVisibleRange();
        ps.applyOptions({ autoScale: false });
        if (r) ps.setVisibleRange(r);
        onAutoScaleChangeRef.current?.(false);
      }
    };
    const onPointerUp = () => {
      press = null;
    };
    host.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);

    return () => {
      ro.disconnect();
      host.removeEventListener("wheel", onWheel);
      host.removeEventListener("keydown", onKey);
      host.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      chart.remove();
      chartRef.current = null;
      mainRef.current = null;
      regsRef.current = [];
      drawingsRef.current = [];
      pendingRef.current = null;
      measureSeriesRef.current = null;
      appliedKeyRef.current = "";
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isDailyRef = useRef(isDaily);
  isDailyRef.current = isDaily;
  const measureSeriesRef = useRef<ISeriesApi<SeriesType> | null>(null);

  function clearMeasure() {
    const chart = chartRef.current;
    if (measureSeriesRef.current && chart) {
      try {
        chart.removeSeries(measureSeriesRef.current);
      } catch {}
    }
    measureSeriesRef.current = null;
    setMeasure(null);
  }

  /* ---------- series structure (chart type + enabled indicators) ---------- */

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;

    const oldMain = mainRef.current;
    const oldRegs = regsRef.current;
    const regs: Reg[] = [];

    // pane indexes
    let next = 1;
    const rsiPane = indicators.rsi ? next++ : -1;
    const macdPane = indicators.macd ? next++ : -1;

    const addLine = (pane: number, color: string, width = 1.5, extra: Record<string, any> = {}) =>
      chart.addSeries(
        LineSeries,
        { color, lineWidth: width as any, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false, ...extra },
        pane
      );

    // main price series
    let main: ISeriesApi<SeriesType>;
    if (chartKind === "area") {
      main = chart.addSeries(AreaSeries, { lineColor: "#6366f1", topColor: "rgba(99,102,241,0.35)", bottomColor: "rgba(99,102,241,0.02)", lineWidth: 2 }, 0);
    } else if (chartKind === "line") {
      main = chart.addSeries(LineSeries, { color: "#6366f1", lineWidth: 2 }, 0);
    } else {
      main = chart.addSeries(
        CandlestickSeries,
        {
          upColor: UP,
          downColor: DOWN,
          borderUpColor: UP,
          borderDownColor: DOWN,
          wickUpColor: UP,
          wickDownColor: DOWN,
        },
        0
      );
    }

    const reg = (r: Omit<Reg, "series"> & { series: ISeriesApi<SeriesType> }) => regs.push(r);

    // price-pane overlays
    const maDef = (id: string, kind: "ema" | "sma", period: number) => {
      const def = INDICATOR_CATALOG.find((d) => d.id === id)!;
      if (!indicators[id]) return;
      reg({
        id,
        pane: "main",
        label: def.label,
        color: def.color,
        kind: "line",
        series: addLine(0, def.color),
        compute: (_c, cl, t) => toLine(t, kind === "ema" ? ema(cl, period) : sma(cl, period)),
      });
    };
    maDef("ema9", "ema", 9);
    maDef("ema21", "ema", 21);
    maDef("ema50", "ema", 50);
    maDef("ema200", "ema", 200);
    maDef("sma20", "sma", 20);
    maDef("sma50", "sma", 50);

    if (indicators.bb) {
      const color = "#8b5cf6";
      reg({ id: "bb", pane: "main", label: "BB 20, 2", color, kind: "line", series: addLine(0, color, 1), compute: (_c, cl, t) => toLine(t, bollinger(cl).upper) });
      reg({ id: "bb_m", pane: "main", label: "BB mid", color, kind: "line", series: addLine(0, color, 1, { lineStyle: LineStyle.Dashed }), compute: (_c, cl, t) => toLine(t, bollinger(cl).mid) });
      reg({ id: "bb_l", pane: "main", label: "BB low", color, kind: "line", series: addLine(0, color, 1), compute: (_c, cl, t) => toLine(t, bollinger(cl).lower) });
    }

    if (indicators.vwap && hasVolume) {
      reg({ id: "vwap", pane: "main", label: "VWAP", color: "#facc15", kind: "line", series: addLine(0, "#facc15"), compute: (c, _cl, t) => toLine(t, vwap(c)) });
    }

    if (indicators.supertrend) {
      reg({
        id: "supertrend",
        pane: "main",
        label: "Supertrend 10, 3",
        color: "#22c55e",
        kind: "line",
        series: addLine(0, "#22c55e", 2),
        compute: (c, _cl, t) => {
          const st = supertrend(c);
          return t.map((time, i) => (st.line[i] !== null && st.up[i] ? { time: time as Time, value: st.line[i] as number } : { time: time as Time }));
        },
      });
      reg({
        id: "supertrend_d",
        pane: "main",
        label: "Supertrend down",
        color: "#ef4444",
        kind: "line",
        series: addLine(0, "#ef4444", 2),
        compute: (c, _cl, t) => {
          const st = supertrend(c);
          return t.map((time, i) => (st.line[i] !== null && !st.up[i] ? { time: time as Time, value: st.line[i] as number } : { time: time as Time }));
        },
      });
    }

    // volume: bottom of the price pane, like FYERS
    if (indicators.volume && hasVolume) {
      const volume = chart.addSeries(
        HistogramSeries,
        { priceFormat: { type: "volume" }, priceScaleId: "volume", lastValueVisible: false, priceLineVisible: false },
        0
      );
      volume.priceScale().applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });
      reg({
        id: "volume",
        pane: "main",
        label: "Volume",
        color: "#64748b",
        kind: "hist",
        series: volume,
        compute: (c, _cl, t) => c.map((k, i) => ({ time: t[i] as Time, value: k.volume, color: k.close >= k.open ? "rgba(16,185,129,0.35)" : "rgba(244,63,94,0.35)" })),
      });
    }

    // RSI pane
    if (rsiPane > 0) {
      const s = addLine(rsiPane, "#a78bfa", 1.5, {
        lastValueVisible: true,
        autoscaleInfoProvider: () => ({ priceRange: { minValue: 0, maxValue: 100 } }),
      });
      s.priceScale().applyOptions({ scaleMargins: { top: 0.08, bottom: 0.08 } });
      for (const [price, dash] of [[70, LineStyle.Dashed], [50, LineStyle.Dotted], [30, LineStyle.Dashed]] as const) {
        s.createPriceLine({ price, color: "rgba(148,163,184,0.45)", lineWidth: 1, lineStyle: dash, axisLabelVisible: price !== 50, title: "" });
      }
      reg({ id: "rsi", pane: "rsi", label: "RSI 14", color: "#a78bfa", kind: "line", series: s, compute: (_c, cl, t) => toLine(t, rsi(cl, 14)) });
    }

    // MACD pane
    if (macdPane > 0) {
      const hist = chart.addSeries(HistogramSeries, { lastValueVisible: false, priceLineVisible: false }, macdPane);
      const line = addLine(macdPane, "#38bdf8", 1.5);
      const sig = addLine(macdPane, "#f59e0b", 1.5);
      line.createPriceLine({ price: 0, color: "rgba(148,163,184,0.4)", lineWidth: 1, lineStyle: LineStyle.Dotted, axisLabelVisible: false, title: "" });
      reg({
        id: "macd_h",
        pane: "macd",
        label: "Hist",
        color: "#64748b",
        kind: "hist",
        series: hist,
        compute: (_c, cl, t) => {
          const m = macd(cl);
          return t.map((time, i) => {
            const v = m.hist[i];
            if (v === null) return { time: time as Time };
            const prev = i > 0 ? m.hist[i - 1] : null;
            const growing = prev === null || Math.abs(v) >= Math.abs(prev);
            const color = v >= 0 ? (growing ? "rgba(16,185,129,0.85)" : "rgba(16,185,129,0.45)") : growing ? "rgba(244,63,94,0.85)" : "rgba(244,63,94,0.45)";
            return { time: time as Time, value: v, color };
          });
        },
      });
      reg({ id: "macd_m", pane: "macd", label: "MACD", color: "#38bdf8", kind: "line", series: line, compute: (_c, cl, t) => toLine(t, macd(cl).macd) });
      reg({ id: "macd_s", pane: "macd", label: "Signal", color: "#f59e0b", kind: "line", series: sig, compute: (_c, cl, t) => toLine(t, macd(cl).signal) });
    }

    // swap: new series are already in place, now drop the old ones
    for (const r of oldRegs) {
      try {
        chart.removeSeries(r.series);
      } catch {}
    }
    if (oldMain) {
      try {
        chart.removeSeries(oldMain);
      } catch {}
    }
    mainRef.current = main;
    regsRef.current = regs;

    // keep horizontal lines the user drew
    for (const d of drawingsRef.current) {
      if (d.kind === "h") {
        d.handle = main.createPriceLine({ price: d.price, color: "#f59e0b", lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: "" });
      }
    }

    // sensible heights: price pane big, indicator panes smaller
    const panes = chart.panes();
    panes.forEach((p, i) => p.setStretchFactor(i === 0 ? 4 : 1.5));

    chart.priceScale("right", 0).applyOptions({
      scaleMargins: { top: 0.06, bottom: indicators.volume && hasVolume ? 0.2 : 0.06 },
    });

    pushData();
    scheduleLegend();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [structureKey]);

  /* ---------- data ---------- */

  function pushData() {
    const chart = chartRef.current;
    const main = mainRef.current;
    if (!chart || !main) return;

    const cs = sanitize(candles);
    csRef.current = cs;
    const idx = new Map<number, number>();
    cs.forEach((c, i) => idx.set(c.time, i));
    timeIdxRef.current = idx;

    const times = cs.map((c) => c.time);
    const closes = cs.map((c) => c.close);
    const shape = chartKind === "heikin" ? heikinAshi(cs) : cs;

    if (chartKind === "area" || chartKind === "line") {
      main.setData(shape.map((c) => ({ time: c.time as Time, value: c.close })) as any);
    } else {
      main.setData(shape.map((c) => ({ time: c.time as Time, open: c.open, high: c.high, low: c.low, close: c.close })) as any);
    }
    for (const r of regsRef.current) r.series.setData(r.compute(cs, closes, times) as any);

    if (cs.length && appliedKeyRef.current !== datasetKey) {
      appliedKeyRef.current = datasetKey;
      applyRange();
    }
  }

  /* ---------- live ticks ---------- */

  const resolutionRef = useRef(resolution);
  resolutionRef.current = resolution;
  const chartKindRef = useRef(chartKind);
  chartKindRef.current = chartKind;
  const flushRef = useRef<number | null>(null);

  // Push the (already updated) last candle and the matching last point of every indicator to the chart.
  function flushLive() {
    flushRef.current = null;
    const main = mainRef.current;
    const cs = csRef.current;
    if (!main || !cs.length) return;
    const kind = chartKindRef.current;
    const last = (kind === "heikin" ? heikinAshi(cs) : cs)[cs.length - 1];
    try {
      if (kind === "area" || kind === "line") main.update({ time: last.time as Time, value: last.close } as any);
      else main.update({ time: last.time as Time, open: last.open, high: last.high, low: last.low, close: last.close } as any);
      const times = cs.map((c) => c.time);
      const closes = cs.map((c) => c.close);
      for (const r of regsRef.current) {
        const data = r.compute(cs, closes, times);
        r.series.update(data[data.length - 1] as any);
      }
    } catch {
      // a refresh replaced the data under us; the next tick or refresh repairs it
    }
    scheduleLegend();
  }

  function applyTick(price: number, ts: number) {
    const cs = csRef.current;
    if (!cs.length || !Number.isFinite(price)) return;
    const last = cs[cs.length - 1];
    const res = resolutionRef.current;
    const daily = res === "D" || res === "1D";
    const step = daily ? 86400 : (parseInt(res, 10) || 15) * 60;
    if (ts < last.time) return; // stale tick

    let t = last.time;
    if (ts >= last.time + step) {
      if (daily) {
        t = last.time + Math.floor((ts - last.time) / step) * step;
      } else {
        const sameDay = Math.floor((ts + IST_OFFSET) / 86400) === Math.floor((last.time + IST_OFFSET) / 86400);
        if (sameDay) {
          t = last.time + Math.floor((ts - last.time) / step) * step;
        } else {
          // first candle of a new session starts at 09:15 IST
          const open = Math.floor((ts + IST_OFFSET) / 86400) * 86400 - IST_OFFSET + 9 * 3600 + 15 * 60;
          if (ts < open) return; // pre-open tick: no candle yet
          t = open + Math.floor((ts - open) / step) * step;
        }
      }
    }

    if (t === last.time) {
      last.close = price;
      if (price > last.high) last.high = price;
      if (price < last.low) last.low = price;
    } else {
      cs.push({ time: t, open: last.close, high: Math.max(last.close, price), low: Math.min(last.close, price), close: price, volume: 0 });
      timeIdxRef.current.set(t, cs.length - 1);
    }
    if (flushRef.current === null) flushRef.current = window.setTimeout(flushLive, 120);
  }

  useEffect(
    () => () => {
      if (flushRef.current !== null) window.clearTimeout(flushRef.current);
    },
    []
  );

  function applyRange() {
    const chart = chartRef.current;
    const cs = csRef.current;
    if (!chart || !cs.length) return;
    const from = firstVisibleIndex(cs, rangeRef.current);
    chart.timeScale().setVisibleLogicalRange({ from: from - 1, to: cs.length - 1 + 8 });
  }

  useEffect(() => {
    pushData();
    scheduleLegend();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [candles, datasetKey]);

  /* ---------- options ---------- */

  useEffect(() => {
    chartRef.current?.priceScale("right", 0).applyOptions({
      mode: isLog ? PriceScaleMode.Logarithmic : PriceScaleMode.Normal,
      autoScale,
    });
  }, [isLog, autoScale, structureKey]);

  useEffect(() => {
    chartRef.current?.applyOptions({
      crosshair: { mode: magnet ? CrosshairMode.Magnet : CrosshairMode.Normal },
      timeScale: { timeVisible: !isDaily },
    });
  }, [magnet, isDaily]);

  useEffect(() => {
    // a half-finished line must not survive a tool change
    if (tool === "crosshair" && pendingRef.current && chartRef.current) {
      try {
        chartRef.current.removeSeries(pendingRef.current.series);
      } catch {}
      pendingRef.current = null;
    }
  }, [tool]);

  /* ---------- drawings ---------- */

  const removeDrawing = useCallback((d: Drawing) => {
    const chart = chartRef.current;
    if (!chart) return;
    try {
      if (d.kind === "h") {
        if (d.handle && mainRef.current) mainRef.current.removePriceLine(d.handle);
      } else {
        chart.removeSeries(d.series);
      }
    } catch {}
  }, []);

  const clearDrawings = useCallback(() => {
    drawingsRef.current.forEach(removeDrawing);
    drawingsRef.current = [];
    const chart = chartRef.current;
    if (pendingRef.current && chart) {
      try {
        chart.removeSeries(pendingRef.current.series);
      } catch {}
      pendingRef.current = null;
    }
    clearMeasure();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [removeDrawing]);

  useEffect(() => {
    clearDrawings();
  }, [drawingsKey, clearDrawings]);

  useImperativeHandle(
    ref,
    () => ({
      screenshot: () => {
        const chart = chartRef.current;
        if (!chart) return null;
        return chart.takeScreenshot().toDataURL("image/png");
      },
      zoom: (factor: number) => {
        const ts = chartRef.current?.timeScale();
        const r = ts?.getVisibleLogicalRange();
        if (!ts || !r) return;
        const w = (r.to - r.from) * factor;
        ts.setVisibleLogicalRange({ from: r.to - w, to: r.to });
      },
      zoomPrice: (factor: number) => {
        const ps = mainRef.current?.priceScale();
        const r = ps?.getVisibleRange();
        if (!ps || !r) return;
        const mid = (r.from + r.to) / 2;
        const h = ((r.to - r.from) * factor) / 2;
        ps.applyOptions({ autoScale: false });
        ps.setVisibleRange({ from: mid - h, to: mid + h });
        onAutoScaleChangeRef.current?.(false);
      },
      pan: (bars: number) => {
        const ts = chartRef.current?.timeScale();
        const r = ts?.getVisibleLogicalRange();
        if (!ts || !r) return;
        ts.setVisibleLogicalRange({ from: r.from + bars, to: r.to + bars });
      },
      applyTick,
      resetView: () => {
        applyRange();
        chartRef.current?.priceScale("right", 0).applyOptions({ autoScale: true });
      },
      undoDrawing: () => {
        if (pendingRef.current && chartRef.current) {
          try {
            chartRef.current.removeSeries(pendingRef.current.series);
          } catch {}
          pendingRef.current = null;
          return;
        }
        if (measureSeriesRef.current) {
          clearMeasure();
          return;
        }
        const d = drawingsRef.current.pop();
        if (d) removeDrawing(d);
      },
      clearDrawings,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [clearDrawings, removeDrawing]
  );

  /* ---------- render ---------- */

  const cursor = tool === "crosshair" ? "cursor-crosshair" : "cursor-cell";

  const Row = ({ r }: { r: LegendRow }) => (
    <span className="inline-flex items-center gap-1 group pointer-events-auto">
      <span style={{ color: r.color }}>{r.label}</span>
      <span style={{ color: r.color }} className="font-semibold">
        {r.value}
      </span>
      {r.removeId && (
        <button
          onClick={() => onToggleIndicator(r.removeId as string)}
          className="opacity-0 group-hover:opacity-100 text-slate-500 hover:text-rose-400 transition-opacity leading-none px-0.5"
          title="Remove indicator"
        >
          ×
        </button>
      )}
    </span>
  );

  return (
    <div ref={wrapRef} className="relative w-full h-full min-h-[480px]">
      <div ref={hostRef} className={`absolute inset-0 ${cursor}`} />

      {/* price pane legend */}
      <div className="absolute left-2 top-1.5 z-10 pointer-events-none font-mono text-[11px] leading-5 max-w-[calc(100%-100px)]">
        {legend.headline && (
          <div className="text-slate-300 whitespace-nowrap overflow-hidden text-ellipsis">
            <span>{legend.headline.text}</span>{" "}
            <span className={legend.headline.up ? "text-emerald-400" : "text-rose-400"}>{legend.headline.change}</span>
          </div>
        )}
        {legend.main.length > 0 && (
          <div className="flex flex-wrap gap-x-3">
            {legend.main.map((r) => (
              <Row key={r.label} r={r} />
            ))}
          </div>
        )}
      </div>

      {/* indicator pane legends */}
      {legend.rsi.length > 0 && (
        <div className="absolute left-2 z-10 pointer-events-none font-mono text-[11px] leading-5" style={{ top: legend.tops.rsi + 4 }}>
          <span className="inline-flex items-center gap-2 pointer-events-auto group">
            <span className="text-slate-300">RSI 14</span>
            <span style={{ color: legend.rsi[0].color }} className="font-semibold">
              {legend.rsi[0].value}
            </span>
            <button onClick={() => onToggleIndicator("rsi")} className="opacity-0 group-hover:opacity-100 text-slate-500 hover:text-rose-400 leading-none" title="Remove RSI">
              ×
            </button>
          </span>
        </div>
      )}
      {legend.macd.length > 0 && (
        <div className="absolute left-2 z-10 pointer-events-none font-mono text-[11px] leading-5" style={{ top: legend.tops.macd + 4 }}>
          <span className="inline-flex items-center gap-2 pointer-events-auto group">
            <span className="text-slate-300">MACD 12 26 9</span>
            {legend.macd.map((r) => (
              <span key={r.label} style={{ color: r.color }} className="font-semibold">
                {r.value}
              </span>
            ))}
            <button onClick={() => onToggleIndicator("macd")} className="opacity-0 group-hover:opacity-100 text-slate-500 hover:text-rose-400 leading-none" title="Remove MACD">
              ×
            </button>
          </span>
        </div>
      )}

      {measure && (
        <div className="absolute top-2 left-1/2 -translate-x-1/2 z-20 px-3 py-1 rounded-lg bg-slate-900/95 border border-white/10 text-xs font-mono text-slate-200 shadow-lg">
          {measure}
          <button onClick={clearMeasure} className="ml-2 text-slate-500 hover:text-white" title="Close">
            ×
          </button>
        </div>
      )}
    </div>
  );
});
