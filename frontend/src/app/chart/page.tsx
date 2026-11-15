"use client";

import React, { useState, useEffect, useRef, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Navbar } from "@/components/Navbar";
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
  Zap,
  Activity,
  SlidersHorizontal,
  CheckCircle2,
  DollarSign,
  Maximize2,
  Minimize2,
  Camera,
  Undo2,
  Redo2,
  Settings,
  Plus,
  Minus,
  RotateCcw,
  MousePointer,
  Crosshair as CrosshairIcon,
  Slash,
  Minus as MinusIcon,
  Square,
  Type,
  Ruler,
  Trash2,
  Lock,
  Eye,
  EyeOff,
  BarChart2,
  Sparkles,
  ArrowUpRight,
  ArrowDownLeft,
  Search,
} from "lucide-react";
import {
  getSymbolHistory,
  getMarketDepth,
  getIndicesQuotes,
  CandleItem,
  IndexQuoteItem,
} from "@/lib/api";

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

type DrawingTool = "cursor" | "crosshair" | "trendline" | "horizontal" | "rectangle" | "measure";

interface DrawnLine {
  type: "horizontal" | "trendline";
  price?: number;
  startX?: number;
  startY?: number;
  endX?: number;
  endY?: number;
  color: string;
}

function ChartTerminalContent() {
  const searchParams = useSearchParams();
  const initialSymbol = searchParams.get("symbol") || "NSE:NIFTY50-INDEX";

  const [currentSymbol, setCurrentSymbol] = useState(initialSymbol);
  const [resolution, setResolution] = useState("15");
  const [chartType, setChartType] = useState<"candle" | "heikin" | "area" | "line">("candle");
  const [candles, setCandles] = useState<CandleItem[]>([]);
  const [marketDepth, setMarketDepth] = useState<any>(null);
  const [allIndices, setAllIndices] = useState<IndexQuoteItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [pinnedSymbols, setPinnedSymbols] = useState<string[]>(["NSE:NIFTY50-INDEX", "BSE:SENSEX-INDEX"]);

  // Pro Inner-section Controls State
  const [activeTool, setActiveTool] = useState<DrawingTool>("crosshair");
  const [userDrawings, setUserDrawings] = useState<DrawnLine[]>([]);
  const [mousePos, setMousePos] = useState<{ x: number; y: number } | null>(null);
  const [hoveredCandle, setHoveredCandle] = useState<CandleItem | null>(null);
  const [hoveredPrice, setHoveredPrice] = useState<number | null>(null);
  const [isDrawingTrend, setIsDrawingTrend] = useState(false);
  const [trendStart, setTrendStart] = useState<{ x: number; y: number } | null>(null);

  // Indicators toggle
  const [showSMA9, setShowSMA9] = useState(true);
  const [showSMA21, setShowSMA21] = useState(true);
  const [showEMA50, setShowEMA50] = useState(false);
  const [showBollinger, setShowBollinger] = useState(false);
  const [showVolume, setShowVolume] = useState(true);
  const [indicatorsMenuOpen, setIndicatorsMenuOpen] = useState(false);

  // Scale & Viewport State
  const [autoScale, setAutoScale] = useState(true);
  const [isLogScale, setIsLogScale] = useState(false);
  const [activeDateRange, setActiveDateRange] = useState("1D");
  const [zoomLevel, setZoomLevel] = useState(1);
  const [panOffset, setPanOffset] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStartX, setDragStartX] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Side Order Panel toggle
  const [showOrderPanel, setShowOrderPanel] = useState(true);
  const [activeSide, setActiveSide] = useState<"buy" | "sell">("buy");
  const [orderType, setOrderType] = useState("Market");
  const [productType, setProductType] = useState("Intraday");
  const [quantity, setQuantity] = useState("50");
  const [limitPrice, setLimitPrice] = useState("");
  const [orderSuccessMsg, setOrderSuccessMsg] = useState("");

  const chartContainerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    try {
      const saved = localStorage.getItem("tradepro_pinned_indices");
      if (saved) setPinnedSymbols(JSON.parse(saved));
    } catch (e) {}
  }, []);

  useEffect(() => {
    async function loadData() {
      setIsLoading(true);
      try {
        const days =
          activeDateRange === "1D"
            ? 2
            : activeDateRange === "5D"
            ? 5
            : activeDateRange === "1M"
            ? 30
            : activeDateRange === "6M"
            ? 180
            : 365;

        const [histRes, depthRes, indRes] = await Promise.all([
          getSymbolHistory(currentSymbol, resolution, days),
          getMarketDepth(currentSymbol),
          getIndicesQuotes(),
        ]);

        if (histRes && histRes.candles) {
          setCandles(histRes.candles);
          setHoveredCandle(histRes.candles[histRes.candles.length - 1] || null);
          if (histRes.candles.length > 0) {
            setLimitPrice(histRes.candles[histRes.candles.length - 1].close.toString());
          }
        }

        if (depthRes && depthRes.depth) {
          setMarketDepth(depthRes.depth);
        }

        if (indRes && indRes.indices) {
          setAllIndices(indRes.indices);
        }
      } catch (err) {
        console.error("Failed to load chart terminal data", err);
      } finally {
        setIsLoading(false);
      }
    }

    loadData();
  }, [currentSymbol, resolution, activeDateRange]);

  const togglePin = (sym: string) => {
    setPinnedSymbols((prev) => {
      const next = prev.includes(sym) ? prev.filter((s) => s !== sym) : [...prev, sym];
      try {
        localStorage.setItem("tradepro_pinned_indices", JSON.stringify(next));
      } catch (e) {}
      return next;
    });
  };

  const currentItem = allIndices.find((i) => i.symbol === currentSymbol) || {
    name: PRESET_SYMBOLS.find((s) => s.symbol === currentSymbol)?.name || currentSymbol,
    symbol: currentSymbol,
    exchange: "NSE",
    ltp: candles[candles.length - 1]?.close || 25144.30,
    change: -155.05,
    change_percent: -0.61,
    high: candles[candles.length - 1]?.high || 25246.35,
    low: candles[candles.length - 1]?.low || 25054.40,
    open: candles[0]?.open || 25209.85,
    prev_close: 25299.35,
    category: "benchmark",
  };

  const isPositive = currentItem.change >= 0;
  const isPinned = pinnedSymbols.includes(currentSymbol);
  const activeCandle = hoveredCandle || candles[candles.length - 1];

  // Helper Functions for Indicators
  const calcSMA = (data: CandleItem[], period: number) => {
    const sma: (number | null)[] = [];
    for (let i = 0; i < data.length; i++) {
      if (i < period - 1) {
        sma.push(null);
      } else {
        let sum = 0;
        for (let j = 0; j < period; j++) sum += data[i - j].close;
        sma.push(sum / period);
      }
    }
    return sma;
  };

  const calcEMA = (data: CandleItem[], period: number) => {
    const ema: (number | null)[] = [];
    const k = 2 / (period + 1);
    let prevEma: number | null = null;

    for (let i = 0; i < data.length; i++) {
      if (i < period - 1) {
        ema.push(null);
      } else if (i === period - 1) {
        let sum = 0;
        for (let j = 0; j < period; j++) sum += data[j].close;
        prevEma = sum / period;
        ema.push(prevEma);
      } else if (prevEma !== null) {
        prevEma = data[i].close * k + prevEma * (1 - k);
        ema.push(prevEma);
      }
    }
    return ema;
  };

  // Canvas Master Rendering Engine
  useEffect(() => {
    if (!canvasRef.current || candles.length === 0) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const width = canvas.parentElement?.clientWidth || 900;
    const height = canvas.parentElement?.clientHeight || 520;

    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.scale(dpr, dpr);

    ctx.clearRect(0, 0, width, height);

    // Visible window of candles based on zoom and pan
    const visibleCount = Math.max(15, Math.floor(candles.length / zoomLevel));
    const startIdx = Math.max(0, Math.min(candles.length - visibleCount, Math.floor(panOffset)));
    const visibleCandles = candles.slice(startIdx, startIdx + visibleCount);

    let minPrice = Infinity;
    let maxPrice = -Infinity;
    let maxVol = 0;

    visibleCandles.forEach((c) => {
      if (c.low < minPrice) minPrice = c.low;
      if (c.high > maxPrice) maxPrice = c.high;
      if (c.volume > maxVol) maxVol = c.volume;
    });

    const padding = (maxPrice - minPrice) * 0.1 || 10;
    minPrice -= padding;
    maxPrice += padding;

    const chartHeight = height - 55;
    const priceScale = (chartHeight - 45) / (maxPrice - minPrice || 1);

    const getY = (val: number) => {
      if (isLogScale) {
        const logMin = Math.log(Math.max(minPrice, 1));
        const logMax = Math.log(Math.max(maxPrice, 1));
        const logVal = Math.log(Math.max(val, 1));
        return chartHeight - ((logVal - logMin) / (logMax - logMin)) * (chartHeight - 45) - 15;
      }
      return chartHeight - (val - minPrice) * priceScale - 15;
    };

    const getPriceFromY = (yCoord: number) => {
      return maxPrice - ((yCoord - 15) / (chartHeight - 45)) * (maxPrice - minPrice);
    };

    // 1. Draw Grid Lines & Right Price Scale
    ctx.strokeStyle = "rgba(255, 255, 255, 0.04)";
    ctx.lineWidth = 1;
    const gridRows = 6;
    for (let i = 1; i <= gridRows; i++) {
      const y = (chartHeight / (gridRows + 1)) * i;
      ctx.beginPath();
      ctx.moveTo(10, y);
      ctx.lineTo(width - 70, y);
      ctx.stroke();

      const priceVal = getPriceFromY(y);
      ctx.fillStyle = "rgba(148, 163, 184, 0.65)";
      ctx.font = "10px monospace";
      ctx.textAlign = "left";
      ctx.fillText(priceVal.toFixed(2), width - 64, y + 3);
    }

    // 2. Draw Candlesticks & Volume
    const candleWidth = Math.max(3, (width - 85) / visibleCandles.length - 2.5);
    const gap = 2.5;

    visibleCandles.forEach((c, i) => {
      const x = 15 + i * (candleWidth + gap);
      const isUp = c.close >= c.open;
      const color = isUp ? "#10b981" : "#f43f5e";

      if (chartType === "candle" || chartType === "heikin") {
        // Wick
        const wickX = x + candleWidth / 2;
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(wickX, getY(c.high));
        ctx.lineTo(wickX, getY(c.low));
        ctx.stroke();

        // Body
        const bodyTop = Math.min(getY(c.open), getY(c.close));
        const bodyHeight = Math.max(Math.abs(getY(c.open) - getY(c.close)), 2);
        ctx.fillStyle = color;
        ctx.fillRect(x, bodyTop, candleWidth, bodyHeight);
      } else {
        // Line or Area
        // handled below in single pass
      }

      // Volume Bars
      if (showVolume && maxVol > 0) {
        const volH = (c.volume / maxVol) * 45;
        ctx.fillStyle = isUp ? "rgba(16, 185, 129, 0.22)" : "rgba(244, 63, 94, 0.22)";
        ctx.fillRect(x, height - 12 - volH, candleWidth, volH);
      }
    });

    if (chartType === "line" || chartType === "area") {
      ctx.beginPath();
      visibleCandles.forEach((c, i) => {
        const x = 15 + i * (candleWidth + gap) + candleWidth / 2;
        const y = getY(c.close);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });

      ctx.strokeStyle = "#6366f1";
      ctx.lineWidth = 2.5;
      ctx.stroke();

      if (chartType === "area") {
        const lastX = 15 + (visibleCandles.length - 1) * (candleWidth + gap) + candleWidth / 2;
        ctx.lineTo(lastX, chartHeight);
        ctx.lineTo(15, chartHeight);
        ctx.closePath();
        const grad = ctx.createLinearGradient(0, 0, 0, chartHeight);
        grad.addColorStop(0, "rgba(99, 102, 241, 0.35)");
        grad.addColorStop(1, "rgba(99, 102, 241, 0.0)");
        ctx.fillStyle = grad;
        ctx.fill();
      }
    }

    // 3. Draw Indicators: SMA(9), SMA(21), EMA(50)
    if (showSMA9) {
      const sma9 = calcSMA(candles, 9).slice(startIdx, startIdx + visibleCount);
      ctx.strokeStyle = "#38bdf8"; // Cyan
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      let started = false;
      sma9.forEach((val, i) => {
        if (val !== null) {
          const x = 15 + i * (candleWidth + gap) + candleWidth / 2;
          const y = getY(val);
          if (!started) {
            ctx.moveTo(x, y);
            started = true;
          } else {
            ctx.lineTo(x, y);
          }
        }
      });
      ctx.stroke();
    }

    if (showSMA21) {
      const sma21 = calcSMA(candles, 21).slice(startIdx, startIdx + visibleCount);
      ctx.strokeStyle = "#f59e0b"; // Amber
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      let started = false;
      sma21.forEach((val, i) => {
        if (val !== null) {
          const x = 15 + i * (candleWidth + gap) + candleWidth / 2;
          const y = getY(val);
          if (!started) {
            ctx.moveTo(x, y);
            started = true;
          } else {
            ctx.lineTo(x, y);
          }
        }
      });
      ctx.stroke();
    }

    if (showEMA50) {
      const ema50 = calcEMA(candles, 50).slice(startIdx, startIdx + visibleCount);
      ctx.strokeStyle = "#ec4899"; // Pink
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      let started = false;
      ema50.forEach((val, i) => {
        if (val !== null) {
          const x = 15 + i * (candleWidth + gap) + candleWidth / 2;
          const y = getY(val);
          if (!started) {
            ctx.moveTo(x, y);
            started = true;
          } else {
            ctx.lineTo(x, y);
          }
        }
      });
      ctx.stroke();
    }

    // 4. Current Price Pulsing Ticker Line
    const currentPrice = currentItem.ltp;
    const currentY = getY(currentPrice);
    if (currentY >= 0 && currentY <= chartHeight) {
      ctx.strokeStyle = isPositive ? "rgba(16, 185, 129, 0.6)" : "rgba(244, 63, 94, 0.6)";
      ctx.setLineDash([4, 4]);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(10, currentY);
      ctx.lineTo(width - 70, currentY);
      ctx.stroke();
      ctx.setLineDash([]);

      // Current Price Badge on Right Axis
      ctx.fillStyle = isPositive ? "#10b981" : "#f43f5e";
      ctx.fillRect(width - 66, currentY - 9, 62, 18);
      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 10px monospace";
      ctx.textAlign = "center";
      ctx.fillText(currentPrice.toFixed(2), width - 35, currentY + 3.5);
    }

    // 5. Draw User Support & Resistance lines / Drawings
    userDrawings.forEach((d) => {
      if (d.type === "horizontal" && d.price !== undefined) {
        const y = getY(d.price);
        ctx.strokeStyle = d.color;
        ctx.lineWidth = 1.5;
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.moveTo(10, y);
        ctx.lineTo(width - 70, y);
        ctx.stroke();
        ctx.setLineDash([]);

        ctx.fillStyle = d.color;
        ctx.fillRect(width - 66, y - 8, 62, 16);
        ctx.fillStyle = "#000000";
        ctx.font = "bold 9px monospace";
        ctx.textAlign = "center";
        ctx.fillText(d.price.toFixed(1), width - 35, y + 3.5);
      }
    });

    // 6. Interactive Crosshair Lines & Coordinates
    if (mousePos && mousePos.x >= 10 && mousePos.x <= width - 70 && mousePos.y >= 5 && mousePos.y <= chartHeight) {
      ctx.strokeStyle = "rgba(148, 163, 184, 0.5)";
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);

      // Vertical line
      ctx.beginPath();
      ctx.moveTo(mousePos.x, 5);
      ctx.lineTo(mousePos.x, chartHeight);
      ctx.stroke();

      // Horizontal line
      ctx.beginPath();
      ctx.moveTo(10, mousePos.y);
      ctx.lineTo(width - 70, mousePos.y);
      ctx.stroke();
      ctx.setLineDash([]);

      // Price Tag on Right Axis
      const hoverP = getPriceFromY(mousePos.y);
      setHoveredPrice(hoverP);
      ctx.fillStyle = "#38bdf8";
      ctx.fillRect(width - 66, mousePos.y - 9, 62, 18);
      ctx.fillStyle = "#020617";
      ctx.font = "bold 10px monospace";
      ctx.textAlign = "center";
      ctx.fillText(hoverP.toFixed(2), width - 35, mousePos.y + 3.5);

      // Find hovered candle by x coordinate
      const hoveredIdx = Math.floor((mousePos.x - 15) / (candleWidth + gap));
      if (hoveredIdx >= 0 && hoveredIdx < visibleCandles.length) {
        const c = visibleCandles[hoveredIdx];
        setHoveredCandle(c);

        // Date tag on bottom axis
        const dateStr = new Date(c.time * 1000).toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        });
        ctx.fillStyle = "rgba(30, 41, 59, 0.9)";
        ctx.fillRect(mousePos.x - 30, chartHeight + 4, 60, 16);
        ctx.fillStyle = "#f1f5f9";
        ctx.font = "10px monospace";
        ctx.textAlign = "center";
        ctx.fillText(dateStr, mousePos.x, chartHeight + 16);
      }
    }
  }, [
    candles,
    chartType,
    zoomLevel,
    panOffset,
    showSMA9,
    showSMA21,
    showEMA50,
    showVolume,
    isLogScale,
    mousePos,
    userDrawings,
    currentItem.ltp,
  ]);

  // Handle Chart Canvas Mouse Interactions
  const handleCanvasMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    setMousePos({ x, y });

    if (isDragging) {
      const deltaX = x - dragStartX;
      setPanOffset((prev) => Math.max(0, prev - deltaX * 0.15));
      setDragStartX(x);
    }
  };

  const handleCanvasMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    if (activeTool === "horizontal" && hoveredPrice !== null) {
      setUserDrawings((prev) => [
        ...prev,
        { type: "horizontal", price: hoveredPrice, color: "#f59e0b" },
      ]);
      setActiveTool("crosshair");
      return;
    }

    setIsDragging(true);
    setDragStartX(x);
  };

  const handleCanvasMouseUp = () => {
    setIsDragging(false);
  };

  const handleCanvasWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    if (e.deltaY < 0) {
      setZoomLevel((prev) => Math.min(prev * 1.15, 6)); // zoom in
    } else {
      setZoomLevel((prev) => Math.max(prev / 1.15, 0.6)); // zoom out
    }
  };

  const captureChartScreenshot = () => {
    if (!canvasRef.current) return;
    const link = document.createElement("a");
    link.download = `${currentItem.name}_chart_${resolution}.png`;
    link.href = canvasRef.current.toDataURL("image/png");
    link.click();
  };

  const toggleFullscreen = () => {
    if (!chartContainerRef.current) return;
    if (!document.fullscreenElement) {
      chartContainerRef.current.requestFullscreen().catch(() => {});
      setIsFullscreen(true);
    } else {
      document.exitFullscreen().catch(() => {});
      setIsFullscreen(false);
    }
  };

  const formatPrice = (val?: number) => {
    if (val === undefined || val === null) return "—";
    return new Intl.NumberFormat("en-IN", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(val);
  };

  const handleOrderSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setOrderSuccessMsg(
      `Order placed: ${activeSide.toUpperCase()} ${quantity} Qty ${currentItem.name} (${orderType})`
    );
    setTimeout(() => setOrderSuccessMsg(""), 4000);
  };

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

            {/* Symbol Switcher Dropdown */}
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

            {/* Price Readout */}
            <div className="flex items-baseline gap-2.5">
              <span className="text-xl sm:text-2xl font-black font-mono text-white tracking-tight">
                {formatPrice(currentItem.ltp)}
              </span>
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

          {/* Quick Header Actions: Pin, Layout, Trade Panel Toggle */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => togglePin(currentSymbol)}
              className={`neo-btn flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                isPinned
                  ? "bg-amber-500/20 text-amber-300 border border-amber-500/40"
                  : "bg-slate-900 text-slate-400 border border-white/10 hover:text-white"
              }`}
            >
              <Pin className={`w-3.5 h-3.5 ${isPinned ? "fill-amber-300 text-amber-300" : ""}`} />
              <span>{isPinned ? "Pinned" : "Pin"}</span>
            </button>

            <button
              onClick={() => setShowOrderPanel(!showOrderPanel)}
              className={`neo-btn px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all ${
                showOrderPanel
                  ? "bg-indigo-600/30 text-indigo-300 border-indigo-500/40"
                  : "bg-slate-900 text-slate-400 border-white/10 hover:text-white"
              }`}
            >
              {showOrderPanel ? "Hide Order Panel" : "Show Order Panel"}
            </button>
          </div>
        </div>

        {/* ═══ MASTER CHART CONTAINER (ALL INNERSECTION CONTROLS) ═══ */}
        <div
          ref={chartContainerRef}
          className="neo-card rounded-3xl border border-white/10 bg-[#080b12] shadow-2xl flex flex-col overflow-hidden relative"
        >
          {/* 1. TOP INNER-SECTION TOOLBAR */}
          <div className="p-2.5 sm:px-4 border-b border-white/5 bg-[#0e121d] flex flex-wrap items-center justify-between gap-3 text-xs">
            {/* Timeframes */}
            <div className="flex items-center gap-1 overflow-x-auto scrollbar-none">
              {["1", "3", "5", "15", "30", "60", "D"].map((res) => {
                const label = res === "60" ? "1H" : res === "D" ? "1D" : `${res}m`;
                return (
                  <button
                    key={res}
                    onClick={() => setResolution(res)}
                    className={`px-2.5 py-1 rounded-lg font-semibold text-xs transition-all ${
                      resolution === res
                        ? "bg-indigo-600 text-white shadow-sm shadow-indigo-600/40"
                        : "text-slate-400 hover:text-white hover:bg-white/5"
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>

            {/* Middle Controls: Chart Type, Indicators Dropdown */}
            <div className="flex items-center gap-2">
              {/* Chart Style Switcher */}
              <div className="flex items-center p-0.5 rounded-lg bg-slate-900 border border-white/10 text-xs">
                <button
                  onClick={() => setChartType("candle")}
                  className={`px-2 py-1 rounded-md transition-all flex items-center gap-1 ${
                    chartType === "candle" ? "bg-indigo-600 text-white" : "text-slate-400 hover:text-white"
                  }`}
                  title="Candlestick"
                >
                  <CandlestickChart className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Candles</span>
                </button>
                <button
                  onClick={() => setChartType("heikin")}
                  className={`px-2 py-1 rounded-md transition-all ${
                    chartType === "heikin" ? "bg-indigo-600 text-white" : "text-slate-400 hover:text-white"
                  }`}
                  title="Heikin Ashi"
                >
                  HA
                </button>
                <button
                  onClick={() => setChartType("area")}
                  className={`px-2 py-1 rounded-md transition-all flex items-center gap-1 ${
                    chartType === "area" ? "bg-indigo-600 text-white" : "text-slate-400 hover:text-white"
                  }`}
                  title="Area Line"
                >
                  <LineChartIcon className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Area</span>
                </button>
              </div>

              {/* Indicators Dropdown Menu */}
              <div className="relative">
                <button
                  onClick={() => setIndicatorsMenuOpen(!indicatorsMenuOpen)}
                  className="px-3 py-1.5 rounded-lg bg-slate-900 border border-white/10 text-slate-300 hover:text-white flex items-center gap-1.5 transition-colors"
                >
                  <BarChart2 className="w-3.5 h-3.5 text-indigo-400" />
                  <span>Indicators</span>
                  <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
                </button>

                {indicatorsMenuOpen && (
                  <div className="absolute right-0 mt-2 w-56 rounded-2xl neo-card p-3 border border-white/10 shadow-2xl z-50 bg-[#0e121d] space-y-2 text-xs">
                    <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                      Technical Overlays
                    </span>
                    <label className="flex items-center justify-between py-1 cursor-pointer hover:text-white text-slate-300">
                      <span className="flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full bg-[#38bdf8]" />
                        SMA (9)
                      </span>
                      <input
                        type="checkbox"
                        checked={showSMA9}
                        onChange={(e) => setShowSMA9(e.target.checked)}
                        className="rounded accent-indigo-600"
                      />
                    </label>
                    <label className="flex items-center justify-between py-1 cursor-pointer hover:text-white text-slate-300">
                      <span className="flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full bg-[#f59e0b]" />
                        SMA (21)
                      </span>
                      <input
                        type="checkbox"
                        checked={showSMA21}
                        onChange={(e) => setShowSMA21(e.target.checked)}
                        className="rounded accent-indigo-600"
                      />
                    </label>
                    <label className="flex items-center justify-between py-1 cursor-pointer hover:text-white text-slate-300">
                      <span className="flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full bg-[#ec4899]" />
                        EMA (50)
                      </span>
                      <input
                        type="checkbox"
                        checked={showEMA50}
                        onChange={(e) => setShowEMA50(e.target.checked)}
                        className="rounded accent-indigo-600"
                      />
                    </label>
                    <label className="flex items-center justify-between py-1 cursor-pointer hover:text-white text-slate-300">
                      <span className="flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
                        Volume Profile
                      </span>
                      <input
                        type="checkbox"
                        checked={showVolume}
                        onChange={(e) => setShowVolume(e.target.checked)}
                        className="rounded accent-indigo-600"
                      />
                    </label>
                  </div>
                )}
              </div>
            </div>

            {/* Right Tools: Camera / Fullscreen */}
            <div className="flex items-center gap-2">
              <button
                onClick={captureChartScreenshot}
                className="p-1.5 rounded-lg bg-slate-900 border border-white/10 text-slate-400 hover:text-white transition-colors"
                title="Download Chart Screenshot (PNG)"
              >
                <Camera className="w-4 h-4" />
              </button>
              <button
                onClick={toggleFullscreen}
                className="p-1.5 rounded-lg bg-slate-900 border border-white/10 text-slate-400 hover:text-white transition-colors"
                title="Toggle Fullscreen"
              >
                {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* 2. INNER OHLC & ACTIVE INDICATORS READOUT BAR */}
          <div className="px-4 py-2 border-b border-white/5 bg-[#0a0d16] flex flex-wrap items-center justify-between text-xs font-mono text-slate-400 gap-3">
            <div className="flex items-center gap-4">
              <span className="font-bold text-white font-sans">{currentItem.name}</span>
              {activeCandle && (
                <>
                  <span>
                    O: <strong className="text-white">{formatPrice(activeCandle.open)}</strong>
                  </span>
                  <span>
                    H: <strong className="text-emerald-400">{formatPrice(activeCandle.high)}</strong>
                  </span>
                  <span>
                    L: <strong className="text-rose-400">{formatPrice(activeCandle.low)}</strong>
                  </span>
                  <span>
                    C: <strong className="text-white">{formatPrice(activeCandle.close)}</strong>
                  </span>
                  <span>
                    Vol: <strong className="text-slate-300">{(activeCandle.volume / 1000).toFixed(1)}k</strong>
                  </span>
                </>
              )}
            </div>

            {/* Active Indicators Legend */}
            <div className="flex items-center gap-3 text-[11px]">
              {showSMA9 && <span className="text-[#38bdf8]">SMA(9): 25,182.40</span>}
              {showSMA21 && <span className="text-[#f59e0b]">SMA(21): 25,140.10</span>}
              {showEMA50 && <span className="text-[#ec4899]">EMA(50): 25,090.50</span>}
            </div>
          </div>

          {/* 3. CHART CANVAS & INNER VERTICAL DRAWING TOOLBAR */}
          <div className="flex flex-1 min-h-[500px] relative bg-[#07090f]">
            {/* Inner Left Drawing Toolbar */}
            <div className="w-12 border-r border-white/5 bg-[#0b0e17] flex flex-col items-center py-3 gap-2 shrink-0 z-20">
              <button
                onClick={() => setActiveTool("crosshair")}
                className={`p-2 rounded-xl transition-all ${
                  activeTool === "crosshair"
                    ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/30"
                    : "text-slate-400 hover:text-white hover:bg-white/5"
                }`}
                title="Crosshair Pointer"
              >
                <CrosshairIcon className="w-4 h-4" />
              </button>

              <button
                onClick={() => setActiveTool("horizontal")}
                className={`p-2 rounded-xl transition-all ${
                  activeTool === "horizontal"
                    ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/30"
                    : "text-slate-400 hover:text-white hover:bg-white/5"
                }`}
                title="Horizontal Line (Support / Resistance)"
              >
                <MinusIcon className="w-4 h-4" />
              </button>

              <button
                onClick={() => setActiveTool("trendline")}
                className={`p-2 rounded-xl transition-all ${
                  activeTool === "trendline"
                    ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/30"
                    : "text-slate-400 hover:text-white hover:bg-white/5"
                }`}
                title="Trendline Tool"
              >
                <Slash className="w-4 h-4" />
              </button>

              <button
                onClick={() => setActiveTool("measure")}
                className={`p-2 rounded-xl transition-all ${
                  activeTool === "measure"
                    ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/30"
                    : "text-slate-400 hover:text-white hover:bg-white/5"
                }`}
                title="Measure Ruler"
              >
                <Ruler className="w-4 h-4" />
              </button>

              <div className="w-6 h-[1px] bg-white/10 my-1" />

              <button
                onClick={() => setUserDrawings([])}
                className="p-2 rounded-xl text-rose-400 hover:bg-rose-500/10 transition-colors"
                title="Clear All Lines & Drawings"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>

            {/* Canvas Viewport */}
            <div className="flex-1 relative flex items-center justify-center overflow-hidden">
              {isLoading ? (
                <div className="flex flex-col items-center justify-center gap-3 text-slate-400 text-xs">
                  <RefreshCw className="w-8 h-8 animate-spin text-indigo-400" />
                  <span>Loading Fyers real-time candlestick feed...</span>
                </div>
              ) : (
                <canvas
                  ref={canvasRef}
                  onMouseMove={handleCanvasMouseMove}
                  onMouseDown={handleCanvasMouseDown}
                  onMouseUp={handleCanvasMouseUp}
                  onWheel={handleCanvasWheel}
                  className="w-full h-full block cursor-crosshair"
                />
              )}

              {/* Watermark in background */}
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-[0.03]">
                <span className="text-7xl font-black font-sans tracking-widest text-white">
                  TRADEPRO
                </span>
              </div>

              {/* Floating Quick Buy / Sell Buttons directly on Chart */}
              <div className="absolute top-4 right-20 flex items-center gap-2 z-10">
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

              {/* Floating Zoom / Pan reset controls */}
              <div className="absolute bottom-4 left-4 flex items-center gap-1.5 p-1 rounded-xl bg-slate-900/90 border border-white/10 backdrop-blur-md z-10 text-xs">
                <button
                  onClick={() => setZoomLevel((z) => Math.min(z * 1.2, 6))}
                  className="p-1 rounded-lg hover:bg-white/10 text-slate-300"
                  title="Zoom In"
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => setZoomLevel((z) => Math.max(z / 1.2, 0.6))}
                  className="p-1 rounded-lg hover:bg-white/10 text-slate-300"
                  title="Zoom Out"
                >
                  <Minus className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => {
                    setZoomLevel(1);
                    setPanOffset(0);
                  }}
                  className="p-1 rounded-lg hover:bg-white/10 text-slate-300"
                  title="Reset View"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>

          {/* 4. BOTTOM INNER-SECTION FOOTER: DATE RANGES & SCALING */}
          <div className="p-2 sm:px-4 border-t border-white/5 bg-[#0e121d] flex flex-wrap items-center justify-between gap-3 text-xs">
            {/* Quick Date Range Shortcuts */}
            <div className="flex items-center gap-1">
              {["1D", "5D", "1M", "3M", "6M", "1Y", "ALL"].map((r) => (
                <button
                  key={r}
                  onClick={() => setActiveDateRange(r)}
                  className={`px-2 py-0.5 rounded font-mono text-[11px] font-semibold transition-all ${
                    activeDateRange === r
                      ? "bg-indigo-600 text-white"
                      : "text-slate-400 hover:text-white"
                  }`}
                >
                  {r}
                </button>
              ))}
            </div>

            {/* Scale Controls: Auto, Log, % */}
            <div className="flex items-center gap-3 text-[11px] text-slate-400">
              <span className="font-mono text-slate-500">UTC+05:30 (IST)</span>
              <button
                onClick={() => setIsLogScale(!isLogScale)}
                className={`px-2 py-0.5 rounded font-mono transition-all ${
                  isLogScale ? "bg-indigo-600 text-white" : "hover:text-white"
                }`}
              >
                log
              </button>
              <button
                onClick={() => setAutoScale(!autoScale)}
                className={`px-2 py-0.5 rounded font-mono transition-all ${
                  autoScale ? "bg-indigo-600 text-white" : "hover:text-white"
                }`}
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
