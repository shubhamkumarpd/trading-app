"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  TrendingUp,
  TrendingDown,
  Activity,
  RefreshCw,
  Pin,
  LineChart,
  ChevronRight,
} from "lucide-react";
import { getIndicesQuotes, IndexQuoteItem } from "@/lib/api";

export function IndicesList() {
  const router = useRouter();
  const [indices, setIndices] = useState<IndexQuoteItem[]>([]);
  const [category, setCategory] = useState<"all" | "benchmark" | "sectoral">("all");
  const [isLoading, setIsLoading] = useState(false);
  const [isLive, setIsLive] = useState(false);
  
  // Pinned state with localStorage persistence
  const [pinnedSymbols, setPinnedSymbols] = useState<string[]>([
    "NSE:NIFTY50-INDEX",
    "BSE:SENSEX-INDEX",
    "NSE:NIFTYBANK-INDEX",
  ]);

  useEffect(() => {
    try {
      const saved = localStorage.getItem("tradepro_pinned_indices");
      if (saved) {
        setPinnedSymbols(JSON.parse(saved));
      }
    } catch (e) {}
  }, []);

  const togglePin = (symbol: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setPinnedSymbols((prev) => {
      let next: string[];
      if (prev.includes(symbol)) {
        next = prev.filter((s) => s !== symbol);
      } else {
        next = [...prev, symbol];
      }
      try {
        localStorage.setItem("tradepro_pinned_indices", JSON.stringify(next));
      } catch (e) {}
      return next;
    });
  };

  const fetchIndices = async () => {
    setIsLoading(true);
    try {
      const res = await getIndicesQuotes();
      if (res && res.indices) {
        setIndices(res.indices);
        setIsLive(res.is_live);
      }
    } catch (err) {
      console.error("Failed to fetch indices", err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchIndices();
    const interval = setInterval(fetchIndices, 15000);
    return () => clearInterval(interval);
  }, []);

  const filteredIndices = indices.filter((item) => {
    if (category === "all") return true;
    if (category === "benchmark") return item.category === "benchmark" || item.category === "volatility";
    if (category === "sectoral") return item.category === "sectoral";
    return true;
  });

  const formatNumber = (val: number) => {
    return new Intl.NumberFormat("en-IN", {
      maximumFractionDigits: 2,
      minimumFractionDigits: 2,
    }).format(val);
  };

  const renderSparkline = (isPositive: boolean) => {
    const strokeColor = isPositive ? "#10b981" : "#f43f5e";
    const fillColor = isPositive ? "rgba(16, 185, 129, 0.12)" : "rgba(244, 63, 94, 0.12)";
    const pathData = isPositive
      ? "M 0,22 Q 25,24 45,15 T 80,18 T 120,6 T 150,2"
      : "M 0,4 Q 25,6 45,16 T 80,14 T 120,24 T 150,28";

    return (
      <svg className="w-full h-8 overflow-visible" viewBox="0 0 150 30" preserveAspectRatio="none">
        <defs>
          <linearGradient id={`spark-${isPositive ? "up" : "down"}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={strokeColor} stopOpacity="0.25" />
            <stop offset="100%" stopColor={strokeColor} stopOpacity="0" />
          </linearGradient>
        </defs>
        <path
          d={`${pathData} L 150,30 L 0,30 Z`}
          fill={`url(#spark-${isPositive ? "up" : "down"})`}
        />
        <path
          d={pathData}
          fill="none"
          stroke={strokeColor}
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  };

  return (
    <div className="w-full space-y-3">
      {/* Header with Title and Category Filters */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
            <Activity className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-base font-bold text-white tracking-tight flex items-center gap-2">
              <span>Market Indices</span>
              {isLive && (
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" title="Live Fyers Feed" />
              )}
            </h2>
            <p className="text-[11px] text-slate-400">
              Click any index to open its dedicated interactive Chart & Terminal Detail Page
            </p>
          </div>
        </div>

        {/* Filter Pills & Refresh */}
        <div className="flex items-center gap-2">
          <div className="flex items-center p-1 rounded-xl bg-[#0e1118] border border-white/[0.08] text-xs">
            <button
              onClick={() => setCategory("all")}
              className={`px-3 py-1 rounded-lg transition-all font-medium ${
                category === "all"
                  ? "bg-indigo-600 text-white shadow-sm"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              All Indices
            </button>
            <button
              onClick={() => setCategory("benchmark")}
              className={`px-3 py-1 rounded-lg transition-all font-medium ${
                category === "benchmark"
                  ? "bg-indigo-600 text-white shadow-sm"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              Benchmark
            </button>
            <button
              onClick={() => setCategory("sectoral")}
              className={`px-3 py-1 rounded-lg transition-all font-medium ${
                category === "sectoral"
                  ? "bg-indigo-600 text-white shadow-sm"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              Sectoral
            </button>
          </div>

          <button
            onClick={fetchIndices}
            disabled={isLoading}
            className="p-2 rounded-xl bg-[#0e1118] border border-white/[0.08] text-slate-400 hover:text-white transition-colors"
            title="Refresh Quotes"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? "animate-spin text-indigo-400" : ""}`} />
          </button>
        </div>
      </div>

      {/* Indices Cards Grid - Direct Link to /chart?symbol=... */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
        {filteredIndices.map((item) => {
          const isPositive = item.change >= 0;
          const isPinned = pinnedSymbols.includes(item.symbol);
          const rangeSpan = item.high - item.low;
          const rangePct =
            rangeSpan > 0 ? Math.min(Math.max(((item.ltp - item.low) / rangeSpan) * 100, 5), 95) : 50;

          return (
            <div
              key={item.symbol}
              onClick={() => router.push(`/chart?symbol=${encodeURIComponent(item.symbol)}`)}
              className="neo-card p-4 rounded-2xl relative overflow-hidden group hover:-translate-y-1 hover:border-indigo-500/50 hover:shadow-xl hover:shadow-indigo-500/10 transition-all duration-300 flex flex-col justify-between space-y-3 bg-gradient-to-b from-[#111624] to-[#0c0f17] cursor-pointer"
            >
              {/* Subtle performance glow in background */}
              <div
                className={`absolute -top-12 -right-12 w-28 h-28 rounded-full blur-[45px] pointer-events-none opacity-20 ${
                  isPositive ? "bg-emerald-500" : "bg-rose-500"
                }`}
              />

              {/* Top Row: Name, Exchange badge, Category & Pin action */}
              <div className="flex items-center justify-between">
                <div>
                  <span className="font-bold text-sm text-white group-hover:text-indigo-300 transition-colors block">
                    {item.name}
                  </span>
                  <span className="text-[10px] text-slate-400 font-mono">
                    {item.exchange}
                  </span>
                </div>

                <div className="flex items-center gap-1.5">
                  {/* Pin Button */}
                  <button
                    onClick={(e) => togglePin(item.symbol, e)}
                    className={`p-1.5 rounded-lg transition-all ${
                      isPinned
                        ? "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                        : "text-slate-500 hover:text-slate-200 hover:bg-white/5 opacity-0 group-hover:opacity-100"
                    }`}
                    title={isPinned ? "Unpin index" : "Pin index to top ticker"}
                  >
                    <Pin className={`w-3.5 h-3.5 ${isPinned ? "fill-amber-300" : ""}`} />
                  </button>

                  <span
                    className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                      isPositive
                        ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                        : "bg-rose-500/10 text-rose-400 border-rose-500/20"
                    }`}
                  >
                    {isPositive ? "+" : ""}
                    {item.change_percent.toFixed(2)}%
                  </span>
                </div>
              </div>

              {/* Middle Row: Price & Points Change */}
              <div className="space-y-1">
                <div className="flex items-baseline justify-between">
                  <span className="text-xl font-extrabold font-mono tracking-tight text-white">
                    {formatNumber(item.ltp)}
                  </span>
                  <span
                    className={`text-xs font-mono font-semibold flex items-center ${
                      isPositive ? "text-emerald-400" : "text-rose-400"
                    }`}
                  >
                    {isPositive ? (
                      <TrendingUp className="w-3.5 h-3.5 mr-0.5" />
                    ) : (
                      <TrendingDown className="w-3.5 h-3.5 mr-0.5" />
                    )}
                    {isPositive ? "+" : ""}
                    {formatNumber(item.change)}
                  </span>
                </div>

                {/* Sparkline Graphic */}
                <div className="pt-1">{renderSparkline(isPositive)}</div>
              </div>

              {/* Bottom: Day Range Low / High Slider */}
              <div className="space-y-1.5 pt-1 border-t border-white/5 text-[10px]">
                <div className="flex justify-between text-slate-400 font-mono">
                  <span>L: {formatNumber(item.low)}</span>
                  <span>H: {formatNumber(item.high)}</span>
                </div>
                <div className="w-full h-1.5 rounded-full bg-slate-800/80 relative overflow-hidden">
                  <div
                    className={`h-full rounded-full ${
                      isPositive ? "bg-emerald-400" : "bg-rose-400"
                    }`}
                    style={{ width: `${rangePct}%` }}
                  />
                </div>

                {/* Clickable Action: Open Detail Page */}
                <div className="pt-1 flex items-center justify-between text-indigo-400 font-semibold group-hover:text-indigo-300">
                  <span className="flex items-center gap-1">
                    <LineChart className="w-3 h-3" />
                    <span>Open Full Chart & Terminal</span>
                  </span>
                  <ChevronRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
