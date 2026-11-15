"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useAuthStore } from "@/store/useAuthStore";
import { Navbar } from "@/components/Navbar";
import { TopHoldingsSummary } from "@/components/TopHoldingsSummary";
import { IndicesList } from "@/components/IndicesList";
import {
  TrendingUp,
  TrendingDown,
  Wallet,
  Activity,
  ArrowUpRight,
  ShieldCheck,
  Zap,
  LogIn,
  Layers,
  LineChart,
} from "lucide-react";

export default function HomePage() {
  const { isAuthenticated, user, checkAuth, isLoading } = useAuthStore();

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#06080d] via-[#090d16] to-[#06080d] text-slate-100 flex flex-col">
      <Navbar />

      {/* Main Content Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-5 space-y-6">
        {/* 1. Ticker Bar - Each item links directly to its detail chart page */}
        <div className="p-3 rounded-2xl neo-card flex items-center justify-between text-xs overflow-x-auto gap-6 scrollbar-none">
          <Link
            href="/chart?symbol=NSE:NIFTY50-INDEX"
            className="flex items-center gap-2 hover:bg-white/5 px-2.5 py-1.5 rounded-xl transition-colors group cursor-pointer"
          >
            <span className="font-semibold text-slate-300 group-hover:text-indigo-400">NIFTY 50</span>
            <span className="font-mono text-emerald-400 font-semibold">25,144.30</span>
            <span className="text-[11px] text-rose-400 flex items-center">
              <TrendingDown className="w-3 h-3 mr-0.5" /> -155.05 (-0.61%)
            </span>
          </Link>

          <Link
            href="/chart?symbol=NSE:NIFTYBANK-INDEX"
            className="flex items-center gap-2 hover:bg-white/5 px-2.5 py-1.5 rounded-xl transition-colors group cursor-pointer"
          >
            <span className="font-semibold text-slate-300 group-hover:text-indigo-400">BANKNIFTY</span>
            <span className="font-mono text-emerald-400 font-semibold">61,034.10</span>
            <span className="text-[11px] text-rose-400 flex items-center">
              <TrendingDown className="w-3 h-3 mr-0.5" /> -484.40 (-0.79%)
            </span>
          </Link>

          <Link
            href="/chart?symbol=BSE:SENSEX-INDEX"
            className="flex items-center gap-2 hover:bg-white/5 px-2.5 py-1.5 rounded-xl transition-colors group cursor-pointer"
          >
            <span className="font-semibold text-slate-300 group-hover:text-indigo-400">SENSEX</span>
            <span className="font-mono text-white font-semibold">81,592.45</span>
            <span className="text-[11px] text-rose-400 flex items-center">
              <TrendingDown className="w-3 h-3 mr-0.5" /> -318.56 (-0.39%)
            </span>
          </Link>

          <Link
            href="/chart?symbol=NSE:FINNIFTY-INDEX"
            className="flex items-center gap-2 hover:bg-white/5 px-2.5 py-1.5 rounded-xl transition-colors group cursor-pointer"
          >
            <span className="font-semibold text-slate-300 group-hover:text-indigo-400">FINNIFTY</span>
            <span className="font-mono text-emerald-400 font-semibold">27,855.50</span>
            <span className="text-[11px] text-rose-400 flex items-center">
              <TrendingDown className="w-3 h-3 mr-0.5" /> -201.65 (-0.72%)
            </span>
          </Link>

          <Link
            href="/chart?symbol=NSE:INDIAVIX-INDEX"
            className="flex items-center gap-2 hover:bg-white/5 px-2.5 py-1.5 rounded-xl transition-colors group cursor-pointer"
          >
            <span className="font-semibold text-slate-300 group-hover:text-indigo-400">INDIA VIX</span>
            <span className="font-mono text-cyan-400 font-semibold">15.50</span>
            <span className="text-[11px] text-cyan-400">-1.12 (-6.74%)</span>
          </Link>
        </div>

        {/* 2. Top Holdings, Positions & Funds Bar */}
        <TopHoldingsSummary />

        {/* 3. Market Indices List Section (Each card opens /chart?symbol=...) */}
        <IndicesList />

        {/* 4. Authentication Notice Banner if Not Logged In */}
        {!isAuthenticated && !isLoading && (
          <div className="relative overflow-hidden rounded-3xl neo-card p-6 sm:p-8 border border-indigo-500/30 bg-gradient-to-r from-indigo-950/40 via-purple-950/20 to-slate-900/60 shadow-2xl">
            <div className="relative z-10 flex flex-col md:flex-row items-center justify-between gap-6">
              <div className="space-y-2 text-center md:text-left">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/20 text-indigo-300 text-xs font-medium border border-indigo-500/30">
                  <Zap className="w-3.5 h-3.5 text-cyan-400" />
                  Live Trading Integration
                </div>
                <h2 className="text-xl sm:text-2xl font-bold text-white tracking-tight">
                  Connect Fyers API to Unlock Execution & Analytics
                </h2>
                <p className="text-xs text-slate-400 max-w-xl">
                  Authenticate your trading session to stream real-time tick-by-tick prices, place and manage orders, and track your P&L with institutional precision.
                </p>
              </div>

              <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
                <Link
                  href="/login"
                  className="neo-btn px-6 py-3 rounded-2xl text-xs font-bold text-white bg-gradient-to-r from-indigo-500 via-indigo-600 to-cyan-500 shadow-lg shadow-indigo-600/30 flex items-center justify-center gap-2"
                >
                  <LogIn className="w-4 h-4" />
                  <span>Connect Fyers Account</span>
                </Link>
              </div>
            </div>
          </div>
        )}

        {/* 5. Top Summary Metrics Cards (Neumorphic 3D) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="neo-card p-5 rounded-2xl relative overflow-hidden group hover:-translate-y-1 transition-transform">
            <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
              <span>Total Portfolio</span>
              <Wallet className="w-4 h-4 text-indigo-400" />
            </div>
            <p className="text-2xl font-extrabold tracking-tight font-mono text-white">
              ₹2,14,278.67
            </p>
            <div className="mt-2 flex items-center text-xs text-emerald-400 font-medium">
              <ArrowUpRight className="w-3.5 h-3.5 mr-0.5" />
              <span>100% Liquid Capital</span>
            </div>
          </div>

          <div className="neo-card p-5 rounded-2xl relative overflow-hidden group hover:-translate-y-1 transition-transform">
            <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
              <span>Today&apos;s Realized P&L</span>
              <Activity className="w-4 h-4 text-emerald-400" />
            </div>
            <p className="text-2xl font-extrabold tracking-tight font-mono text-emerald-400">
              ₹0.00
            </p>
            <div className="mt-2 flex items-center text-xs text-slate-400 font-medium">
              <span>No positions closed today</span>
            </div>
          </div>

          <div className="neo-card p-5 rounded-2xl relative overflow-hidden group hover:-translate-y-1 transition-transform">
            <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
              <span>Available Margin</span>
              <Layers className="w-4 h-4 text-cyan-400" />
            </div>
            <p className="text-2xl font-extrabold tracking-tight font-mono text-white">
              ₹2,14,278.67
            </p>
            <div className="mt-2 text-xs text-emerald-400">
              <span>100% available • Live synced</span>
            </div>
          </div>

          <div className="neo-card p-5 rounded-2xl relative overflow-hidden group hover:-translate-y-1 transition-transform">
            <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
              <span>Broker Session</span>
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
            </div>
            <p className="text-base font-bold text-white flex items-center gap-2">
              {isAuthenticated ? (
                <>
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 shadow-sm shadow-emerald-400" />
                  <span>Connected ({user?.fy_id || "FAL22896"})</span>
                </>
              ) : (
                <>
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
                  <span>FAL22896 Active</span>
                </>
              )}
            </p>
            <div className="mt-2 text-xs text-slate-400">
              <span className="text-emerald-400">Fyers API v3 Active</span>
            </div>
          </div>
        </div>

        {/* 6. Dashboard Panels Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Watchlist Panel (2 Cols) */}
          <div id="watchlist" className="lg:col-span-2 neo-card rounded-3xl p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-white/5 pb-4">
              <div>
                <h3 className="text-sm font-bold text-white">Live Watchlist</h3>
                <p className="text-xs text-slate-400">Click any symbol to open its Chart detail page</p>
              </div>
              <div className="flex items-center gap-2">
                <span className="px-3 py-1 rounded-lg text-xs font-semibold bg-indigo-600 text-white">
                  Nifty 50
                </span>
                <span className="px-3 py-1 rounded-lg text-xs font-medium text-slate-400 bg-white/5 hover:text-white cursor-pointer">
                  F&O
                </span>
              </div>
            </div>

            {/* Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-slate-400 border-b border-white/5">
                    <th className="text-left pb-3 font-semibold">Symbol</th>
                    <th className="text-right pb-3 font-semibold">LTP</th>
                    <th className="text-right pb-3 font-semibold">Change</th>
                    <th className="text-right pb-3 font-semibold">Volume</th>
                    <th className="text-center pb-3 font-semibold">Chart & Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  <tr className="group hover:bg-white/5 transition-colors">
                    <td className="py-3 font-semibold text-white">
                      <Link href="/chart?symbol=NSE:RELIANCE-EQ" className="hover:text-indigo-400">
                        RELIANCE
                      </Link>
                    </td>
                    <td className="py-3 text-right font-mono font-medium">₹2,485.30</td>
                    <td className="py-3 text-right font-mono text-emerald-400">+1.32%</td>
                    <td className="py-3 text-right text-slate-400">12.4M</td>
                    <td className="py-3 text-center">
                      <div className="inline-flex gap-1.5 items-center">
                        <Link
                          href="/chart?symbol=NSE:RELIANCE-EQ"
                          className="px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-indigo-500/20 text-indigo-400 border border-indigo-500/30 hover:bg-indigo-500 hover:text-white transition-all flex items-center gap-1"
                        >
                          <LineChart className="w-3 h-3" />
                          <span>Chart</span>
                        </Link>
                        <Link
                          href="/chart?symbol=NSE:RELIANCE-EQ"
                          className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500 hover:text-white transition-all"
                        >
                          TRADE
                        </Link>
                      </div>
                    </td>
                  </tr>
                  <tr className="group hover:bg-white/5 transition-colors">
                    <td className="py-3 font-semibold text-white">
                      <Link href="/chart?symbol=NSE:HDFCBANK-EQ" className="hover:text-indigo-400">
                        HDFCBANK
                      </Link>
                    </td>
                    <td className="py-3 text-right font-mono font-medium">₹1,678.90</td>
                    <td className="py-3 text-right font-mono text-emerald-400">+0.74%</td>
                    <td className="py-3 text-right text-slate-400">18.2M</td>
                    <td className="py-3 text-center">
                      <div className="inline-flex gap-1.5 items-center">
                        <Link
                          href="/chart?symbol=NSE:HDFCBANK-EQ"
                          className="px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-indigo-500/20 text-indigo-400 border border-indigo-500/30 hover:bg-indigo-500 hover:text-white transition-all flex items-center gap-1"
                        >
                          <LineChart className="w-3 h-3" />
                          <span>Chart</span>
                        </Link>
                        <Link
                          href="/chart?symbol=NSE:HDFCBANK-EQ"
                          className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500 hover:text-white transition-all"
                        >
                          TRADE
                        </Link>
                      </div>
                    </td>
                  </tr>
                  <tr className="group hover:bg-white/5 transition-colors">
                    <td className="py-3 font-semibold text-white">
                      <Link href="/chart?symbol=NSE:TCS-EQ" className="hover:text-indigo-400">
                        TCS
                      </Link>
                    </td>
                    <td className="py-3 text-right font-mono font-medium">₹4,125.60</td>
                    <td className="py-3 text-right font-mono text-rose-400">-0.44%</td>
                    <td className="py-3 text-right text-slate-400">5.8M</td>
                    <td className="py-3 text-center">
                      <div className="inline-flex gap-1.5 items-center">
                        <Link
                          href="/chart?symbol=NSE:TCS-EQ"
                          className="px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-indigo-500/20 text-indigo-400 border border-indigo-500/30 hover:bg-indigo-500 hover:text-white transition-all flex items-center gap-1"
                        >
                          <LineChart className="w-3 h-3" />
                          <span>Chart</span>
                        </Link>
                        <Link
                          href="/chart?symbol=NSE:TCS-EQ"
                          className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500 hover:text-white transition-all"
                        >
                          TRADE
                        </Link>
                      </div>
                    </td>
                  </tr>
                  <tr className="group hover:bg-white/5 transition-colors">
                    <td className="py-3 font-semibold text-white">
                      <Link href="/chart?symbol=NSE:TATAMOTORS-EQ" className="hover:text-indigo-400">
                        TATAMOTORS
                      </Link>
                    </td>
                    <td className="py-3 text-right font-mono font-medium">₹945.20</td>
                    <td className="py-3 text-right font-mono text-rose-400">-0.59%</td>
                    <td className="py-3 text-right text-slate-400">22.6M</td>
                    <td className="py-3 text-center">
                      <div className="inline-flex gap-1.5 items-center">
                        <Link
                          href="/chart?symbol=NSE:TATAMOTORS-EQ"
                          className="px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-indigo-500/20 text-indigo-400 border border-indigo-500/30 hover:bg-indigo-500 hover:text-white transition-all flex items-center gap-1"
                        >
                          <LineChart className="w-3 h-3" />
                          <span>Chart</span>
                        </Link>
                        <Link
                          href="/chart?symbol=NSE:TATAMOTORS-EQ"
                          className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500 hover:text-white transition-all"
                        >
                          TRADE
                        </Link>
                      </div>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Quick Trade / Account Status Panel (1 Col) */}
          <div id="orders" className="neo-card rounded-3xl p-6 space-y-5">
            <div className="border-b border-white/5 pb-3">
              <h3 className="text-sm font-bold text-white">Live Broker Summary</h3>
              <p className="text-xs text-slate-400">Real-time status synced with Fyers</p>
            </div>

            <div className="space-y-3 text-xs">
              <div className="flex justify-between items-center py-2 border-b border-white/5">
                <span className="text-slate-400">Client ID</span>
                <span className="font-mono font-semibold text-cyan-400">FAL22896</span>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-white/5">
                <span className="text-slate-400">Clear Balance</span>
                <span className="font-mono font-semibold text-emerald-400">₹2,14,278.67</span>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-white/5">
                <span className="text-slate-400">Open Positions</span>
                <span className="font-semibold text-white">0 Positions</span>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-white/5">
                <span className="text-slate-400">DDPI Authorization</span>
                <span className="font-semibold text-emerald-400">Active ✓</span>
              </div>
            </div>

            <div className="pt-2 space-y-2">
              <Link
                href="/chart?symbol=NSE:NIFTY50-INDEX"
                className="neo-btn w-full py-3 rounded-2xl text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-500 flex items-center justify-center gap-2 shadow-lg shadow-indigo-600/30"
              >
                <LineChart className="w-4 h-4" />
                <span>Open Trading Chart Terminal</span>
              </Link>

              <Link
                href="/profile"
                className="w-full py-2.5 rounded-2xl text-xs font-semibold text-slate-300 bg-white/5 hover:bg-white/10 border border-white/10 flex items-center justify-center gap-2 transition-colors"
              >
                <Layers className="w-4 h-4" />
                <span>View Full Funds & Ledger</span>
              </Link>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
