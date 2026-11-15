"use client";

import React, { useState, useEffect, useRef } from "react";
import {
  X,
  TrendingUp,
  TrendingDown,
  Pin,
  RefreshCw,
  CandlestickChart,
  LineChart as LineChartIcon,
  Maximize2,
  Calendar,
  Layers,
  Sparkles,
} from "lucide-react";
import { getSymbolHistory, CandleItem, IndexQuoteItem } from "@/lib/api";

interface IndexChartModalProps {
  indexItem: IndexQuoteItem;
  isOpen: boolean;
  onClose: () => void;
  isPinned: boolean;
  onTogglePin: (symbol: string) => void;
}

export function IndexChartModal({
  indexItem,
  isOpen,
  onClose,
  isPinned,
  onTogglePin,
}: IndexChartModalProps) {
  const [resolution, setResolution] = useState("15");
  const [chartType, setChartType] = useState<"candle" | "area">("candle");
  const [candles, setCandles] = useState<CandleItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [hoveredCandle, setHoveredCandle] = useState<CandleItem | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

   const [zoomLevel, setZoomLevel] = useState(1);
   const [panX, setPanX] = useState(0);

   const [isDragging, setIsDragging] = useState(false);

  useEffect(() => {
    if (!isOpen) return;

    async function fetchChart() {
      setIsLoading(true);
      try {
        const days = resolution === "1" ? 2 : resolution === "5" ? 5 : resolution === "15" ? 10 : 30;
        const res = await getSymbolHistory(indexItem.symbol, resolution, days);
        if (res && res.candles) {
          setCandles(res.candles);
          setHoveredCandle(res.candles[res.candles.length - 1] || null);
        }
      } catch (err) {
        console.error("Failed to fetch candles", err);
      } finally {
        setIsLoading(false);
      }
    }

    fetchChart();
  }, [isOpen, indexItem.symbol, resolution]);

  // Draw chart on canvas
  useEffect(() => {
    if (!canvasRef.current || candles.length === 0) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Handle high DPI
    const dpr = window.devicePixelRatio || 1;
    const baseWidth = width * dpr;
    const baseHeight = height * dpr;
    const zoomFactor = zoomLevel;
    canvas.width = baseWidth * zoomFactor;
    canvas.height = baseHeight * zoomFactor;
    canvas.style.width = `${baseWidth * zoomFactor}px`;
    canvas.style.height = `${baseHeight * zoomFactor}px`;
    ctx.scale(zoomLevel, zoomLevel);

    // Apply horizontal pan offset
    const parentClientWidth = canvas.parentElement?.clientWidth || 0;
    const offsetX = panX - (parentClientWidth / 2);
    canvas.style.left = `${offsetX}px`;

    // Clear
    ctx.clearRect(0, 0, width, height);

    // Drag / pan handling for chart
    useEffect(() => {
      const canvasEl = canvasRef.current;
      if (!canvasEl) return;
      let startX = 0;
      let startY = 0;
      const handleMouseDown = (e) => {
        if (e.target === canvasEl) {
          setIsDragging(true);
          startX = e.clientX;
          startY = e.clientY;
        }
      };
      const handleMouseMove = (e) => {
        if (isDragging) {
          setPanX(e.clientX - startX);
        }
      };
      const handleMouseUp = () => {
        setIsDragging(false);
      };
      document.addEventListener("mousedown", handleMouseDown);
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
      return () => {
        document.removeEventListener("mousedown", handleMouseDown);
        document.removeEventListener("mousemove", handleMouseMove);
        document.removeEventListener("mouseup", handleMouseUp);
      };
    }, [])

    // Find min and max
    let minPrice = Infinity;
    let maxPrice = -Infinity;
    let maxVol = 0;

    candles.forEach((c) => {
      if (c.low < minPrice) minPrice = c.low;
      if (c.high > maxPrice) maxPrice = c.high;
      if (c.volume > maxVol) maxVol = c.volume;
    });

    const padding = (maxPrice - minPrice) * 0.08 || 10;
    minPrice -= padding;
    maxPrice += padding;

    const chartHeight = height - 40;
    const priceScale = (chartHeight - 40) / (maxPrice - minPrice || 1);

    const getY = (val: number) => {
      return chartHeight - (val - minPrice) * priceScale - 10;
    };

    // Draw Grid Lines
    ctx.strokeStyle = "rgba(255, 255, 255, 0.04)";
    ctx.lineWidth = 1;
    for (let i = 1; i <= 4; i++) {
      const y = (chartHeight / 5) * i;
      ctx.beginPath();
      ctx.moveTo(10, y);
      ctx.lineTo(width - 60, y);
      ctx.stroke();

      // Price labels on right
      const priceVal = maxPrice - (i / 5) * (maxPrice - minPrice);
      ctx.fillStyle = "rgba(148, 163, 184, 0.6)";
      ctx.font = "10px monospace";
      ctx.textAlign = "left";
      ctx.fillText(priceVal.toFixed(1), width - 52, y + 3);
    }

    const candleWidth = Math.max(3, (width - 70) / candles.length - 2);
    const gap = 2;

    if (chartType === "candle") {
      candles.forEach((c, i) => {
        const x = 15 + i * (candleWidth + gap);
        const isUp = c.close >= c.open;
        const color = isUp ? "#10b981" : "#f43f5e";

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

        // Volume Bar
        if (maxVol > 0) {
          const volH = (c.volume / maxVol) * 35;
          ctx.fillStyle = isUp ? "rgba(16, 185, 129, 0.2)" : "rgba(244, 63, 94, 0.2)";
          ctx.fillRect(x, height - 10 - volH, candleWidth, volH);
        }
      });
    } else {
      // Area / Line Chart
      ctx.beginPath();
      candles.forEach((c, i) => {
        const x = 15 + i * (candleWidth + gap) + candleWidth / 2;
        const y = getY(c.close);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });

      ctx.strokeStyle = "#6366f1";
      ctx.lineWidth = 2.5;
      ctx.stroke();

      // Area fill
      const lastX = 15 + (candles.length - 1) * (candleWidth + gap) + candleWidth / 2;
      ctx.lineTo(lastX, chartHeight);
      ctx.lineTo(15, chartHeight);
      ctx.closePath();

      const grad = ctx.createLinearGradient(0, 0, 0, chartHeight);
      grad.addColorStop(0, "rgba(99, 102, 241, 0.35)");
      grad.addColorStop(1, "rgba(99, 102, 241, 0.0)");
      ctx.fillStyle = grad;
      ctx.fill();
    }
  }, [candles, chartType]);

  if (!isOpen) return null;

  const isPositive = indexItem.change >= 0;
  const activeCandle = hoveredCandle || candles[candles.length - 1];

  const formatPrice = (val?: number) => {
    if (val === undefined || val === null) return "—";
    return new Intl.NumberFormat("en-IN", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(val);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="neo-card w-full max-w-4xl rounded-3xl border border-white/10 shadow-2xl bg-[#0b0e17] overflow-hidden flex flex-col max-h-[92vh]">
        {/* Modal Top Header */}
        <div className="p-5 sm:p-6 border-b border-white/5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-gradient-to-r from-[#101422] to-[#0b0e17]">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center font-black text-indigo-400 text-lg">
              {indexItem.name.slice(0, 2)}
            </div>

            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-bold text-white tracking-tight">
                  {indexItem.name}
                </h2>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-white/5 border border-white/10 text-slate-400">
                  {indexItem.exchange}
                </span>
                <span className="text-[10px] uppercase font-semibold px-2 py-0.5 rounded-full bg-indigo-500/15 text-indigo-400 border border-indigo-500/30">
                  {indexItem.category}
                </span>
              </div>
              <p className="text-xs font-mono text-slate-400 mt-0.5">
                {indexItem.symbol}
              </p>
            </div>
          </div>

          {/* Right Header Actions */}
          <div className="flex items-center gap-2.5">
            {/* Pin to Top Toggle */}
            <button
              onClick={() => onTogglePin(indexItem.symbol)}
              className={`neo-btn flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold transition-all ${
                isPinned
                  ? "bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-amber-500/10"
                  : "bg-white/5 text-slate-400 border border-white/10 hover:text-white"
              }`}
            >
              <Pin className={`w-3.5 h-3.5 ${isPinned ? "fill-amber-300 text-amber-300" : ""}`} />
              <span>{isPinned ? "Pinned" : "Pin Index"}</span>
            </button>

            <button
              onClick={onClose}
              className="p-2 rounded-xl bg-white/5 border border-white/10 text-slate-400 hover:text-white transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Price & OHLC Readout Strip */}
        <div className="px-5 sm:px-6 py-3 border-b border-white/5 bg-[#0e121e]/60 flex flex-wrap items-center justify-between gap-4 text-xs">
          {/* Main Price & Change */}
          <div className="flex items-baseline gap-3">
            <span className="text-2xl font-black font-mono text-white tracking-tight">
              {formatPrice(indexItem.ltp)}
            </span>
            <span
              className={`font-mono font-bold flex items-center gap-1 px-2 py-0.5 rounded-md ${
                isPositive
                  ? "bg-emerald-500/15 text-emerald-400"
                  : "bg-rose-500/15 text-rose-400"
              }`}
            >
              {isPositive ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
              {isPositive ? "+" : ""}
              {formatPrice(indexItem.change)} ({isPositive ? "+" : ""}
              {indexItem.change_percent.toFixed(2)}%)
            </span>
          </div>

          {/* Interactive OHLC Readout */}
          {activeCandle && (
            <div className="flex items-center gap-4 text-slate-400 font-mono text-[11px]">
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
              {activeCandle.volume > 0 && (
                <span>
                  Vol: <strong className="text-slate-300">{(activeCandle.volume / 1000).toFixed(1)}k</strong>
                </span>
              )}
            </div>
          )}
        </div>

        {/* Timeframe & Chart Style Toolbar */}
        <div className="px-5 sm:px-6 py-2.5 border-b border-white/5 flex items-center justify-between text-xs bg-[#0b0e17]">
          {/* Timeframe Pills */}
          <div className="flex items-center gap-1">
            {["1", "5", "15", "60", "D"].map((res) => {
              const label = res === "60" ? "1H" : res === "D" ? "1D" : `${res}m`;
              return (
                <button
                  key={res}
                  onClick={() => setResolution(res)}
                  className={`px-3 py-1 rounded-lg font-semibold text-xs transition-all ${
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

          {/* Chart Type Toggle */}
          <div className="flex items-center gap-1 p-0.5 rounded-lg bg-white/5 border border-white/10">
            <button
              onClick={() => setChartType("candle")}
              className={`p-1.5 rounded-md transition-all ${
                chartType === "candle" ? "bg-indigo-600 text-white" : "text-slate-400 hover:text-white"
              }`}
              title="Candlestick Chart"
            >
              <CandlestickChart className="w-4 h-4" />
            </button>
            <button
              onClick={() => setChartType("area")}
              className={`p-1.5 rounded-md transition-all ${
                chartType === "area" ? "bg-indigo-600 text-white" : "text-slate-400 hover:text-white"
              }`}
              title="Area Line Chart"
            >
              <LineChartIcon className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Controls */}
        <div className="flex items-center gap-2 mb-3">
          <button
            onClick={() => setZoomLevel(z => Math.max(1, z - 1))}
            className={`p-1.5 rounded-md transition-all ${chartType === "candle" ? "bg-indigo-600 text-white" : "text-slate-400 hover:text-white"}`}
            title="Zoom Out"
          >
            <CandlestickChart className="w-4 h-4" />
          </button>
          <button
            onClick={() => setZoomLevel(z => Math.min(3, z + 1))}
            className={`p-1.5 rounded-md transition-all ${chartType === "candle" ? "bg-indigo-600 text-white" : "text-slate-400 hover:text-white"}`}
            title="Zoom In"
          >
            <CandlestickChart className="w-4 h-4" />
          </button>
          <input
            type="range"
            min={1}
            max={3}
            step={0.25}
            value={zoomLevel}
            onChange={(e) => setZoomLevel(parseFloat(e.target.value))}
            className="w-full accent-indigo"
          />
        </div>

        {/* Canvas Chart Area */}
        <div className="relative flex-1 p-4 sm:p-6 bg-[#080b12] flex items-center justify-center min-h-[340px]">\n
          {isLoading ? (
            <div className="flex flex-col items-center gap-3 text-slate-400 text-xs">
              <RefreshCw className="w-6 h-6 animate-spin text-indigo-400" />
              <span>Streaming Fyers historical candles...</span>
            </div>
          ) : candles.length > 0 ? (
            <div className="w-full h-full relative">
              <canvas ref={canvasRef} className="w-full h-[340px] block" />
            </div>
          ) : (
            <div className="text-slate-400 text-xs">No candle data available for this timeframe</div>
          )}
        </div>

        {/* Bottom Actions Bar */}
        <div className="p-4 sm:p-5 border-t border-white/5 bg-[#0b0e17] flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-slate-400">Live Fyers Data Feed</span>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              onClick={() => alert(`Added ${indexItem.name} to watch terminal`)}
              className="neo-btn px-4 py-2 rounded-xl bg-white/5 border border-white/10 text-slate-300 hover:text-white font-medium"
            >
              + Add to Watchlist
            </button>
            <button
              onClick={() => {
                onClose();
                window.location.hash = "watchlist";
              }}
              className="neo-btn px-5 py-2 rounded-xl bg-gradient-to-r from-indigo-500 to-cyan-500 text-white font-bold shadow-lg shadow-indigo-600/30"
            >
              Trade {indexItem.name} F&O
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
