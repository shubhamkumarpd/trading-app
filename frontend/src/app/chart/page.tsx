"use client";

import React, { useCallback, useEffect, useRef, useState, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Navbar } from "@/components/Navbar";
import {
  TradingChart,
  INDICATOR_CATALOG,
  DEFAULT_INDICATORS,
  type ChartKind,
  type DrawTool,
  type RangeKey,
  type TradingChartHandle,
} from "@/components/TradingChart";
import {
  TrendingUp,
  TrendingDown,
  ArrowLeft,
  Pin,
  RefreshCw,
  CandlestickChart,
  LineChart as LineChartIcon,
  Layers,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Zap,
  CheckCircle2,
  Maximize2,
  Minimize2,
  Camera,
  Undo2,
  Plus,
  Minus,
  RotateCcw,
  Crosshair as CrosshairIcon,
  Slash,
  Minus as MinusIcon,
  Ruler,
  Trash2,
  BarChart2,
  Magnet,
  MoveHorizontal,
  MoveVertical,
} from "lucide-react";
import { getSymbolHistory, getMarketDepth, getIndicesQuotes, CandleItem, IndexQuoteItem } from "@/lib/api";

const PRESET_SYMBOLS = [
  { symbol: "NSE:NIFTY50-INDEX", name: "NIFTY 50", exchange: "NSE", cat: "benchmark" },
  { symbol: "NSE:NIFTYBANK-INDEX", name: "BANK NIFTY", exchange: "NSE", cat: "benchmark" },
  { symbol: "BSE:SENSEX-INDEX", name: "SENSEX", exchange: "BSE", cat: "benchmark" },
  { symbol: "NSE:FINNIFTY-INDEX", name: "FIN NIFTY", exchange: "NSE", cat: "benchmark" },
  { symbol: "NSE:INDIAVIX-INDEX", name: "INDIA VIX", exchange: "NSE", cat: "volatility" },
  { symbol: "NSE:NIFTYIT-INDEX", name: "NIFTY IT", exchange: "NSE", cat: "sectoral" },
  { symbol: "NSE:NIFTYAUTO-INDEX", name: "NIFTY AUTO", exchange: "NSE", cat: "sectoral" },
  { symbol: "NSE:RELIANCE-EQ", name: "RELIANCE", exchange: "NSE", cat: "equity" },
  { symbol: "NSE:HDFCBANK-EQ", name: "HDFC BANK", exchange: "NSE", cat: "equity" },
  { symbol: "NSE:TCS-EQ", name: "TCS", exchange: "NSE", cat: "equity" },
  { symbol: "NSE:TATAMOTORS-EQ", name: "TATA MOTORS", exchange: "NSE", cat: "equity" },
  { symbol: "NSE:INFY-EQ", name: "INFOSYS", exchange: "NSE", cat: "equity" },
];

const TIMEFRAMES = ["1", "3", "5", "15", "30", "60", "D"];
const RANGES: RangeKey[] = ["1D", "5D", "1M", "3M", "6M", "1Y", "ALL"];
// how many calendar days of history to request for each range (backend clamps to the FYERS limits)
const RANGE_DAYS: Record<RangeKey, number> = { "1D": 5, "5D": 10, "1M": 35, "3M": 100, "6M": 185, "1Y": 370, ALL: 730 };
const POLL_MS = 10_000;
const IST_OFFSET = 19800;

const tfLabel = (res: string) => (res === "60" ? "1H" : res === "D" ? "1D" : `${res}m`);

/** Quote derived from the candles themselves, used until the live index quote arrives. */
function deriveQuote(cs: CandleItem[]) {
  if (!cs.length) return { ltp: 0, change: 0, pct: 0, prev: 0, high: 0, low: 0, open: 0 };
  const last = cs[cs.length - 1];
  const lastDay = Math.floor((last.time + IST_OFFSET) / 86400);
  let prev = cs[0].open;
  let open = last.open;
  let high = last.high;
  let low = last.low;
  for (let i = cs.length - 1; i >= 0; i--) {
    const d = Math.floor((cs[i].time + IST_OFFSET) / 86400);
    if (d < lastDay) {
      prev = cs[i].close;
      break;
    }
    open = cs[i].open;
    high = Math.max(high, cs[i].high);
    low = Math.min(low, cs[i].low);
  }
  const change = last.close - prev;
  return { ltp: last.close, change, pct: prev ? (change / prev) * 100 : 0, prev, high, low, open };
}

/** Button that keeps firing while it is held down (for smooth zoom / pan). */
function HoldButton({
  onFire,
  title,
  children,
  className = "",
}: {
  onFire: () => void;
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const stop = () => {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
  };
  const start = () => {
    onFire();
    stop();
    timer.current = setInterval(onFire, 90);
  };
  useEffect(() => stop, []);
  return (
    <button
      type="button"
      title={title}
      onMouseDown={start}
      onMouseUp={stop}
      onMouseLeave={stop}
      onTouchStart={(e) => {
        e.preventDefault();
        start();
      }}
      onTouchEnd={stop}
      className={`p-1.5 rounded-lg hover:bg-white/10 text-slate-300 active:bg-indigo-600/40 select-none ${className}`}
    >
      {children}
    </button>
  );
}

function ChartTerminalContent() {
  const searchParams = useSearchParams();
  const initialSymbol = searchParams.get("symbol") || "NSE:NIFTY50-INDEX";

  const [currentSymbol, setCurrentSymbol] = useState(initialSymbol);
  const [resolution, setResolution] = useState("15");
  const [chartKind, setChartKind] = useState<ChartKind>("candle");
  const [candles, setCandles] = useState<CandleItem[]>([]);
  const [loadedKey, setLoadedKey] = useState("");
  const [isLive, setIsLive] = useState(false);
  const [marketDepth, setMarketDepth] = useState<any>(null);
  const [allIndices, setAllIndices] = useState<IndexQuoteItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [pinnedSymbols, setPinnedSymbols] = useState<string[]>(["NSE:NIFTY50-INDEX", "BSE:SENSEX-INDEX"]);

  // chart controls
  const [tool, setTool] = useState<DrawTool>("crosshair");
  const [magnet, setMagnet] = useState(false);
  const [indicators, setIndicators] = useState<Record<string, boolean>>(DEFAULT_INDICATORS);
  const [indicatorsMenuOpen, setIndicatorsMenuOpen] = useState(false);
  const [autoScale, setAutoScale] = useState(true);
  const [isLogScale, setIsLogScale] = useState(false);
  const [activeDateRange, setActiveDateRange] = useState<RangeKey>("1D");
  const [isFullscreen, setIsFullscreen] = useState(false);

  // order panel
  const [showOrderPanel, setShowOrderPanel] = useState(true);
  const [activeSide, setActiveSide] = useState<"buy" | "sell">("buy");
  const [orderType, setOrderType] = useState("Market");
  const [productType, setProductType] = useState("Intraday");
  const [quantity, setQuantity] = useState("50");
  const [limitPrice, setLimitPrice] = useState("");
  const [orderSuccessMsg, setOrderSuccessMsg] = useState("");

  const chartContainerRef = useRef<HTMLDivElement | null>(null);
  const indicatorsRef = useRef<HTMLDivElement | null>(null);
  const chartApi = useRef<TradingChartHandle | null>(null);
  const activeKeyRef = useRef("");

  const datasetKey = `${currentSymbol}|${resolution}|${activeDateRange}`;
  activeKeyRef.current = datasetKey;

  /* ---- saved preferences ---- */
  useEffect(() => {
    try {
      const saved = localStorage.getItem("tradepro_pinned_indices");
      if (saved) setPinnedSymbols(JSON.parse(saved));
      const ind = localStorage.getItem("tradepro_chart_indicators");
      if (ind) setIndicators({ ...DEFAULT_INDICATORS, ...JSON.parse(ind) });
      const prefs = localStorage.getItem("tradepro_chart_prefs");
      if (prefs) {
        const p = JSON.parse(prefs);
        if (p.resolution) setResolution(p.resolution);
        if (p.chartKind) setChartKind(p.chartKind);
        if (typeof p.magnet === "boolean") setMagnet(p.magnet);
        if (typeof p.isLogScale === "boolean") setIsLogScale(p.isLogScale);
      }
    } catch (e) {}
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem("tradepro_chart_prefs", JSON.stringify({ resolution, chartKind, magnet, isLogScale }));
    } catch (e) {}
  }, [resolution, chartKind, magnet, isLogScale]);

  const toggleIndicator = useCallback((id: string) => {
    setIndicators((prev) => {
      const next = { ...prev, [id]: !prev[id] };
      try {
        localStorage.setItem("tradepro_chart_indicators", JSON.stringify(next));
      } catch (e) {}
      return next;
    });
  }, []);

  /* ---- data: full load on symbol / timeframe / range change ---- */
  useEffect(() => {
    let cancelled = false;
    async function loadData() {
      setIsLoading(true);
      try {
        const [histRes, depthRes, indRes] = await Promise.all([
          getSymbolHistory(currentSymbol, resolution, RANGE_DAYS[activeDateRange]),
          getMarketDepth(currentSymbol),
          getIndicesQuotes(),
        ]);
        if (cancelled) return;
        if (histRes && histRes.candles) {
          setCandles(histRes.candles);
          setLoadedKey(`${currentSymbol}|${resolution}|${activeDateRange}`);
          setIsLive(!!histRes.is_live);
          if (histRes.candles.length > 0) setLimitPrice(histRes.candles[histRes.candles.length - 1].close.toString());
        }
        if (depthRes && depthRes.depth) setMarketDepth(depthRes.depth);
        if (indRes && indRes.indices) setAllIndices(indRes.indices);
      } catch (err) {
        console.error("Failed to load chart terminal data", err);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }
    loadData();
    return () => {
      cancelled = true;
    };
  }, [currentSymbol, resolution, activeDateRange]);

  /* ---- data: quiet refresh so the last candle keeps moving (live data only) ---- */
  useEffect(() => {
    if (!isLive) return;
    const key = datasetKey;
    const id = setInterval(async () => {
      if (document.hidden) return;
      try {
        const [hist, ind] = await Promise.all([
          getSymbolHistory(currentSymbol, resolution, RANGE_DAYS[activeDateRange]),
          getIndicesQuotes(),
        ]);
        if (activeKeyRef.current !== key) return; // user already switched symbol / timeframe
        if (hist && hist.candles && hist.is_live) setCandles(hist.candles);
        if (ind && ind.indices) setAllIndices(ind.indices);
      } catch (e) {}
    }, POLL_MS);
    return () => clearInterval(id);
  }, [isLive, datasetKey, currentSymbol, resolution, activeDateRange]);

  // close the indicators menu when clicking anywhere outside it
  useEffect(() => {
    if (!indicatorsMenuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (indicatorsRef.current && !indicatorsRef.current.contains(e.target as Node)) setIndicatorsMenuOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [indicatorsMenuOpen]);

  useEffect(() => {
    const onFs = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);

  const togglePin = (sym: string) => {
    setPinnedSymbols((prev) => {
      const next = prev.includes(sym) ? prev.filter((s) => s !== sym) : [...prev, sym];
      try {
        localStorage.setItem("tradepro_pinned_indices", JSON.stringify(next));
      } catch (e) {}
      return next;
    });
  };

  const derived = deriveQuote(candles);
  const liveItem = allIndices.find((i) => i.symbol === currentSymbol);
  const currentItem: IndexQuoteItem = liveItem || {
    name: PRESET_SYMBOLS.find((s) => s.symbol === currentSymbol)?.name || currentSymbol,
    symbol: currentSymbol,
    exchange: PRESET_SYMBOLS.find((s) => s.symbol === currentSymbol)?.exchange || "NSE",
    ltp: derived.ltp,
    change: derived.change,
    change_percent: derived.pct,
    high: derived.high,
    low: derived.low,
    open: derived.open,
    prev_close: derived.prev,
    category: "benchmark",
  };
  const isPositive = currentItem.change >= 0;
  const isPinned = pinnedSymbols.includes(currentSymbol);
  const symbolName = PRESET_SYMBOLS.find((s) => s.symbol === currentSymbol)?.name || currentItem.name;

  const captureChartScreenshot = () => {
    const url = chartApi.current?.screenshot();
    if (!url) return;
    const link = document.createElement("a");
    link.download = `${currentItem.name}_${tfLabel(resolution)}_chart.png`;
    link.href = url;
    link.click();
  };

  const toggleFullscreen = () => {
    if (!chartContainerRef.current) return;
    if (!document.fullscreenElement) chartContainerRef.current.requestFullscreen().catch(() => {});
    else document.exitFullscreen().catch(() => {});
  };

  const formatPrice = (val?: number) => {
    if (val === undefined || val === null) return "—";
    return new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(val);
  };

  const handleOrderSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setOrderSuccessMsg(`Order placed: ${activeSide.toUpperCase()} ${quantity} Qty ${currentItem.name} (${orderType})`);
    setTimeout(() => setOrderSuccessMsg(""), 4000);
  };

  const toolBtn = (t: DrawTool, title: string, icon: React.ReactNode) => (
    <button
      onClick={() => setTool(t)}
      className={`p-2 rounded-xl transition-all ${
        tool === t ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/30" : "text-slate-400 hover:text-white hover:bg-white/5"
      }`}
      title={title}
    >
      {icon}
    </button>
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#06080d] via-[#090d16] to-[#06080d] text-slate-100 flex flex-col">
      <Navbar />

      <main className="flex-1 max-w-[1780px] w-full mx-auto px-2 sm:px-4 py-3 space-y-3">
        {/* Top Header Navigation Strip */}
        <div className="neo-card p-3 rounded-2xl flex flex-wrap items-center justify-between gap-3 bg-[#0e1118]/90">
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="p-2 rounded-xl bg-slate-900 border border-white/5 hover:border-white/20 text-slate-400 hover:text-white transition-colors"
              title="Back to Home Dashboard"
            >
              <ArrowLeft className="w-4 h-4" />
            </Link>

            <div className="relative">
              <select
                value={currentSymbol}
                onChange={(e) => setCurrentSymbol(e.target.value)}
                className="neo-input appearance-none bg-[#121624] text-white font-bold text-xs sm:text-sm pl-3 pr-8 py-2 rounded-xl cursor-pointer border border-white/10 focus:outline-none focus:ring-1 focus:ring-indigo-400"
              >
                {PRESET_SYMBOLS.map((s) => (
                  <option key={s.symbol} value={s.symbol} className="bg-[#0f121d] text-white">
                    {s.name} ({s.exchange})
                  </option>
                ))}
              </select>
              <ChevronDown className="w-4 h-4 absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            </div>

            <div className="flex items-baseline gap-2.5">
              <span className="text-xl sm:text-2xl font-black font-mono text-white tracking-tight">{formatPrice(currentItem.ltp)}</span>
              <span
                className={`font-mono font-bold text-xs flex items-center gap-1 px-2 py-0.5 rounded-full ${
                  isPositive ? "bg-emerald-500/15 text-emerald-400" : "bg-rose-500/15 text-rose-400"
                }`}
              >
                {isPositive ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
                {isPositive ? "+" : ""}
                {formatPrice(currentItem.change)} ({isPositive ? "+" : ""}
                {currentItem.change_percent.toFixed(2)}%)
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => togglePin(currentSymbol)}
              className={`neo-btn flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                isPinned ? "bg-amber-500/20 text-amber-300 border border-amber-500/40" : "bg-slate-900 text-slate-400 border border-white/10 hover:text-white"
              }`}
            >
              <Pin className={`w-3.5 h-3.5 ${isPinned ? "fill-amber-300 text-amber-300" : ""}`} />
              <span>{isPinned ? "Pinned" : "Pin"}</span>
            </button>

            <button
              onClick={() => setShowOrderPanel(!showOrderPanel)}
              className={`neo-btn px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all ${
                showOrderPanel ? "bg-indigo-600/30 text-indigo-300 border-indigo-500/40" : "bg-slate-900 text-slate-400 border-white/10 hover:text-white"
              }`}
            >
              {showOrderPanel ? "Hide Order Panel" : "Show Order Panel"}
            </button>
          </div>
        </div>

        {/* ═══ MASTER CHART CONTAINER ═══ */}
        <div
          ref={chartContainerRef}
          className={`neo-card rounded-3xl border border-white/10 bg-[#080b12] shadow-2xl flex flex-col overflow-hidden relative ${
            isFullscreen ? "h-screen rounded-none" : ""
          }`}
        >
          {/* 1. TOP TOOLBAR */}
          <div className="p-2.5 sm:px-4 border-b border-white/5 bg-[#0e121d] flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-1 overflow-x-auto scrollbar-none">
              {TIMEFRAMES.map((res) => (
                <button
                  key={res}
                  onClick={() => setResolution(res)}
                  className={`px-2.5 py-1 rounded-lg font-semibold text-xs transition-all ${
                    resolution === res ? "bg-indigo-600 text-white shadow-sm shadow-indigo-600/40" : "text-slate-400 hover:text-white hover:bg-white/5"
                  }`}
                >
                  {tfLabel(res)}
                </button>
              ))}
              {!isLive && !isLoading && (
                <Link
                  href="/login"
                  className="ml-2 px-2 py-0.5 rounded-full bg-amber-500/15 border border-amber-500/40 text-amber-300 text-[10px] font-bold whitespace-nowrap hover:bg-amber-500/25"
                  title="These candles are sample data. Log in with Fyers to see real prices."
                >
                  DEMO DATA · connect Fyers
                </Link>
              )}
            </div>

            <div className="flex items-center gap-2">
              {/* Chart style */}
              <div className="flex items-center p-0.5 rounded-lg bg-slate-900 border border-white/10 text-xs">
                {(
                  [
                    ["candle", "Candlestick", <CandlestickChart key="c" className="w-3.5 h-3.5" />, "Candles"],
                    ["heikin", "Heikin Ashi", null, "HA"],
                    ["area", "Area", <LineChartIcon key="a" className="w-3.5 h-3.5" />, "Area"],
                    ["line", "Line", null, "Line"],
                  ] as [ChartKind, string, React.ReactNode, string][]
                ).map(([k, title, icon, label]) => (
                  <button
                    key={k}
                    onClick={() => setChartKind(k)}
                    className={`px-2 py-1 rounded-md transition-all flex items-center gap-1 ${
                      chartKind === k ? "bg-indigo-600 text-white" : "text-slate-400 hover:text-white"
                    }`}
                    title={title}
                  >
                    {icon}
                    <span className={icon ? "hidden sm:inline" : ""}>{label}</span>
                  </button>
                ))}
              </div>

              {/* Indicators */}
              <div className="relative" ref={indicatorsRef}>
                <button
                  onClick={() => setIndicatorsMenuOpen(!indicatorsMenuOpen)}
                  className="px-3 py-1.5 rounded-lg bg-slate-900 border border-white/10 text-slate-300 hover:text-white flex items-center gap-1.5 transition-colors"
                >
                  <BarChart2 className="w-3.5 h-3.5 text-indigo-400" />
                  <span>Indicators</span>
                  <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
                </button>

                {indicatorsMenuOpen && (
                  <>
                    <div className="absolute right-0 mt-2 w-64 max-h-[70vh] overflow-y-auto rounded-2xl neo-card p-3 border border-white/10 shadow-2xl z-50 bg-[#0e121d] text-xs">
                      {(["overlay", "pane"] as const).map((group) => (
                        <div key={group} className="mb-2 last:mb-0">
                          <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                            {group === "overlay" ? "On price chart" : "Separate panes (below price)"}
                          </span>
                          {INDICATOR_CATALOG.filter((d) => d.group === group).map((d) => (
                            <label key={d.id} className="flex items-center justify-between py-1.5 cursor-pointer hover:text-white text-slate-300">
                              <span className="flex items-center gap-2">
                                <span className="w-2.5 h-2.5 rounded-full" style={{ background: d.color }} />
                                {d.label}
                              </span>
                              <input
                                type="checkbox"
                                checked={!!indicators[d.id]}
                                onChange={() => toggleIndicator(d.id)}
                                className="rounded accent-indigo-600"
                              />
                            </label>
                          ))}
                        </div>
                      ))}
                      <p className="text-[10px] text-slate-500 pt-1 border-t border-white/5">VWAP and Volume need volume data (indices have none).</p>
                    </div>
                  </>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={captureChartScreenshot}
                className="p-1.5 rounded-lg bg-slate-900 border border-white/10 text-slate-400 hover:text-white transition-colors"
                title="Download chart screenshot (PNG)"
              >
                <Camera className="w-4 h-4" />
              </button>
              <button
                onClick={toggleFullscreen}
                className="p-1.5 rounded-lg bg-slate-900 border border-white/10 text-slate-400 hover:text-white transition-colors"
                title="Toggle fullscreen"
              >
                {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* 2. CHART + LEFT DRAWING TOOLBAR */}
          <div className={`flex relative bg-[#07090f] ${isFullscreen ? "flex-1 min-h-0" : "h-[600px] sm:h-[680px]"}`}>
            <div className="w-12 border-r border-white/5 bg-[#0b0e17] flex flex-col items-center py-3 gap-2 shrink-0 z-20">
              {toolBtn("crosshair", "Crosshair / pointer", <CrosshairIcon className="w-4 h-4" />)}
              {toolBtn("horizontal", "Horizontal line (support / resistance): click on the chart", <MinusIcon className="w-4 h-4" />)}
              {toolBtn("trendline", "Trendline: click two points", <Slash className="w-4 h-4" />)}
              {toolBtn("measure", "Measure: click two points", <Ruler className="w-4 h-4" />)}

              <div className="w-6 h-[1px] bg-white/10 my-1" />

              <button
                onClick={() => setMagnet(!magnet)}
                className={`p-2 rounded-xl transition-all ${magnet ? "bg-indigo-600 text-white" : "text-slate-400 hover:text-white hover:bg-white/5"}`}
                title="Magnet: crosshair snaps to candle prices"
              >
                <Magnet className="w-4 h-4" />
              </button>
              <button
                onClick={() => chartApi.current?.undoDrawing()}
                className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-white/5 transition-colors"
                title="Undo last drawing"
              >
                <Undo2 className="w-4 h-4" />
              </button>
              <button
                onClick={() => chartApi.current?.clearDrawings()}
                className="p-2 rounded-xl text-rose-400 hover:bg-rose-500/10 transition-colors"
                title="Clear all drawings"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 relative overflow-hidden">
              {candles.length > 0 && (
                <TradingChart
                  ref={chartApi}
                  candles={candles}
                  datasetKey={loadedKey}
                  drawingsKey={`${currentSymbol}|${resolution}`}
                  symbolName={symbolName}
                  resolutionLabel={tfLabel(resolution)}
                  range={activeDateRange}
                  chartKind={chartKind}
                  indicators={indicators}
                  onToggleIndicator={toggleIndicator}
                  isLog={isLogScale}
                  autoScale={autoScale}
                  magnet={magnet}
                  isDaily={resolution === "D"}
                  tool={tool}
                  onToolDone={() => setTool("crosshair")}
                  onAutoScaleChange={setAutoScale}
                />
              )}

              {isLoading && (
                <div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-3 text-slate-400 text-xs bg-[#07090f]/70 backdrop-blur-sm">
                  <RefreshCw className="w-8 h-8 animate-spin text-indigo-400" />
                  <span>Loading chart data...</span>
                </div>
              )}

              {/* Quick Buy / Sell */}
              <div className="absolute top-3 right-24 hidden md:flex items-center gap-2 z-10">
                <button
                  onClick={() => {
                    setActiveSide("buy");
                    setShowOrderPanel(true);
                  }}
                  className="px-3.5 py-1.5 rounded-xl font-bold text-xs bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 hover:bg-emerald-500 hover:text-white shadow-lg backdrop-blur-md transition-all"
                >
                  BUY @ {formatPrice(currentItem.ltp)}
                </button>
                <button
                  onClick={() => {
                    setActiveSide("sell");
                    setShowOrderPanel(true);
                  }}
                  className="px-3.5 py-1.5 rounded-xl font-bold text-xs bg-rose-500/20 text-rose-400 border border-rose-500/40 hover:bg-rose-500 hover:text-white shadow-lg backdrop-blur-md transition-all"
                >
                  SELL @ {formatPrice(currentItem.ltp)}
                </button>
              </div>

            </div>
          </div>

          {/* 3. FOOTER: RANGES, SCALE MODES, HELP */}
          <div className="p-2 sm:px-4 border-t border-white/5 bg-[#0e121d] flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-1">
              {RANGES.map((r) => (
                <button
                  key={r}
                  onClick={() => setActiveDateRange(r)}
                  className={`px-2 py-0.5 rounded font-mono text-[11px] font-semibold transition-all ${
                    activeDateRange === r ? "bg-indigo-600 text-white" : "text-slate-400 hover:text-white"
                  }`}
                >
                  {r}
                </button>
              ))}
            </div>

            {/* View controls: full manual control of the chart */}
            <div className="flex items-center gap-1 p-0.5 rounded-xl bg-slate-900/90 border border-white/10 text-xs">
              <HoldButton onFire={() => chartApi.current?.pan(-3)} title="Move back in time (also ← key / drag)">
                <ChevronLeft className="w-4 h-4" />
              </HoldButton>
              <HoldButton onFire={() => chartApi.current?.pan(3)} title="Move forward in time (also → key / drag)">
                <ChevronRight className="w-4 h-4" />
              </HoldButton>
              <span className="w-px h-5 bg-white/10 mx-0.5" />
              <span className="text-slate-500 px-0.5" title="Candle width">
                <MoveHorizontal className="w-3.5 h-3.5" />
              </span>
              <HoldButton onFire={() => chartApi.current?.zoom(1 / 0.93)} title="Make candles smaller (zoom out) · mouse wheel down">
                <Minus className="w-4 h-4" />
              </HoldButton>
              <HoldButton onFire={() => chartApi.current?.zoom(0.93)} title="Stretch candles wider (zoom in) · mouse wheel up">
                <Plus className="w-4 h-4" />
              </HoldButton>
              <span className="w-px h-5 bg-white/10 mx-0.5" />
              <span className="text-slate-500 px-0.5" title="Price scale">
                <MoveVertical className="w-3.5 h-3.5" />
              </span>
              <HoldButton onFire={() => chartApi.current?.zoomPrice(1 / 0.93)} title="Squeeze price scale (candles shorter) · Shift + wheel down">
                <Minus className="w-4 h-4" />
              </HoldButton>
              <HoldButton onFire={() => chartApi.current?.zoomPrice(0.93)} title="Stretch price scale (candles taller) · Shift + wheel up">
                <Plus className="w-4 h-4" />
              </HoldButton>
              <span className="w-px h-5 bg-white/10 mx-0.5" />
              <button
                onClick={() => {
                  setAutoScale(true);
                  chartApi.current?.resetView();
                }}
                className="p-1.5 rounded-lg hover:bg-white/10 text-slate-300"
                title="Reset view"
              >
                <RotateCcw className="w-4 h-4" />
              </button>
            </div>

            <span className="hidden 2xl:block text-[10px] text-slate-500">
              Wheel: zoom · Shift+wheel: stretch price · Drag: move · Drag axis: stretch · Dbl-click axis: reset
            </span>

            <div className="flex items-center gap-3 text-[11px] text-slate-400">
              <span className="font-mono text-slate-500">UTC+05:30 (IST)</span>
              <button
                onClick={() => setIsLogScale(!isLogScale)}
                className={`px-2 py-0.5 rounded font-mono transition-all ${isLogScale ? "bg-indigo-600 text-white" : "hover:text-white"}`}
                title="Logarithmic price scale"
              >
                log
              </button>
              <button
                onClick={() => setAutoScale(!autoScale)}
                className={`px-2 py-0.5 rounded font-mono transition-all ${autoScale ? "bg-indigo-600 text-white" : "hover:text-white"}`}
                title="Auto: price scale fits the visible candles. Off: you control it (drag the chart up/down)"
              >
                auto
              </button>
            </div>
          </div>
        </div>

        {/* ═══ COLLAPSIBLE SIDE ORDER EXECUTION & LEVEL-2 MARKET DEPTH ═══ */}
        {showOrderPanel && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 animate-in fade-in duration-200">
            {/* Order Placement Box (6 cols) */}
            <div className="lg:col-span-6 neo-card p-5 rounded-3xl border border-white/10 bg-[#0e121e]/90 space-y-4">
              <div className="flex items-center justify-between border-b border-white/5 pb-2.5">
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <Zap className="w-4 h-4 text-cyan-400" />
                  <span>Execute Order • {currentItem.name}</span>
                </h3>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-white/5 text-slate-400">
                  LTP: {formatPrice(currentItem.ltp)}
                </span>
              </div>

              {orderSuccessMsg && (
                <div className="p-3 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
                  <span>{orderSuccessMsg}</span>
                </div>
              )}

              {/* Buy / Sell Tabs */}
              <div className="grid grid-cols-2 p-1 rounded-xl bg-slate-900/80 border border-white/5 text-xs font-bold">
                <button
                  type="button"
                  onClick={() => setActiveSide("buy")}
                  className={`py-2 rounded-lg transition-all ${
                    activeSide === "buy"
                      ? "bg-emerald-600 text-white shadow-lg shadow-emerald-600/30"
                      : "text-slate-400 hover:text-white"
                  }`}
                >
                  BUY / LONG
                </button>
                <button
                  type="button"
                  onClick={() => setActiveSide("sell")}
                  className={`py-2 rounded-lg transition-all ${
                    activeSide === "sell"
                      ? "bg-rose-600 text-white shadow-lg shadow-rose-600/30"
                      : "text-slate-400 hover:text-white"
                  }`}
                >
                  SELL / SHORT
                </button>
              </div>

              {/* Form Controls */}
              <form onSubmit={handleOrderSubmit} className="space-y-3.5">
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div>
                    <label className="text-slate-400 block mb-1 text-[11px]">Product</label>
                    <select
                      value={productType}
                      onChange={(e) => setProductType(e.target.value)}
                      className="neo-input w-full px-3 py-2 rounded-xl text-white font-medium bg-[#131826]"
                    >
                      <option>Intraday (MIS)</option>
                      <option>Delivery (CNC)</option>
                      <option>Margin (NRML)</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-slate-400 block mb-1 text-[11px]">Order Type</label>
                    <select
                      value={orderType}
                      onChange={(e) => setOrderType(e.target.value)}
                      className="neo-input w-full px-3 py-2 rounded-xl text-white font-medium bg-[#131826]"
                    >
                      <option>Market</option>
                      <option>Limit</option>
                      <option>Stop Loss (SL)</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div>
                    <label className="text-slate-400 block mb-1 text-[11px]">Quantity</label>
                    <input
                      type="number"
                      value={quantity}
                      onChange={(e) => setQuantity(e.target.value)}
                      className="neo-input w-full px-3 py-2 rounded-xl text-white font-mono bg-[#131826]"
                    />
                  </div>
                  <div>
                    <label className="text-slate-400 block mb-1 text-[11px]">Price (₹)</label>
                    <input
                      type="text"
                      disabled={orderType === "Market"}
                      value={orderType === "Market" ? "At Market Price" : limitPrice}
                      onChange={(e) => setLimitPrice(e.target.value)}
                      className="neo-input w-full px-3 py-2 rounded-xl text-white font-mono bg-[#131826] disabled:opacity-50"
                    />
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-white/[0.02] border border-white/5 flex justify-between text-xs">
                  <span className="text-slate-400">Est. Margin</span>
                  <span className="font-mono text-white font-bold">
                    {formatPrice((parseFloat(quantity) || 1) * (currentItem.ltp / 5))}
                  </span>
                </div>

                <button
                  type="submit"
                  className={`neo-btn w-full py-3 rounded-2xl font-bold text-xs text-white shadow-lg transition-all ${
                    activeSide === "buy"
                      ? "bg-gradient-to-r from-emerald-500 to-teal-600 shadow-emerald-500/25 hover:from-emerald-400 hover:to-teal-500"
                      : "bg-gradient-to-r from-rose-500 to-red-600 shadow-rose-500/25 hover:from-rose-400 hover:to-red-500"
                  }`}
                >
                  {activeSide === "buy" ? "CONFIRM BUY ORDER" : "CONFIRM SELL ORDER"}
                </button>
              </form>
            </div>

            {/* Level-2 Market Depth (6 cols) */}
            <div className="lg:col-span-6 neo-card p-5 rounded-3xl border border-white/10 bg-[#0e121e]/90 space-y-3">
              <div className="flex items-center justify-between border-b border-white/5 pb-2.5">
                <span className="text-xs font-bold text-white flex items-center gap-1.5">
                  <Layers className="w-3.5 h-3.5 text-indigo-400" />
                  Level-2 Market Depth
                </span>
                <span className="text-[10px] text-slate-400 font-mono">5 Bids / 5 Asks</span>
              </div>

              {marketDepth?.bids && marketDepth.bids.length > 0 ? (
                <div className="space-y-2 text-xs font-mono">
                  <div className="grid grid-cols-2 gap-2 text-[10px] text-slate-500 border-b border-white/5 pb-1">
                    <div className="flex justify-between">
                      <span>Bid Qty</span>
                      <span>Bid Price</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Ask Price</span>
                      <span>Ask Qty</span>
                    </div>
                  </div>

                  {marketDepth.bids.slice(0, 5).map((bid: any, idx: number) => {
                    const ask = marketDepth.ask?.[idx] || { price: 0, volume: 0 };
                    return (
                      <div key={idx} className="grid grid-cols-2 gap-2 text-[11px]">
                        <div className="flex justify-between text-emerald-400">
                          <span className="text-slate-400">{bid.volume}</span>
                          <span className="font-semibold">{formatPrice(bid.price)}</span>
                        </div>
                        <div className="flex justify-between text-rose-400">
                          <span className="font-semibold">{formatPrice(ask.price)}</span>
                          <span className="text-slate-400">{ask.volume}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="py-6 text-center text-xs text-slate-400">
                  <p>Index Spot quotes are reference levels.</p>
                  <p className="text-[11px] text-slate-500 mt-1">
                    Lower Circuit: {formatPrice(marketDepth?.lower_ckt)} | Upper: {formatPrice(marketDepth?.upper_ckt)}
                  </p>
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

export default function ChartTerminalPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#06080d] flex items-center justify-center text-white">Loading Terminal...</div>}>
      <ChartTerminalContent />
    </Suspense>
  );
}
