"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import {
  ChevronRight,
  Eye,
  EyeOff,
  Plus,
  ArrowRight,
  ArrowDownLeft,
  ExternalLink,
} from "lucide-react";
import { getUserFundsDetails, getUserHoldings, getUserPositions } from "@/lib/api";

interface TopHoldingsSummaryProps {
  onAddFundsClick?: () => void;
}

export function TopHoldingsSummary({ onAddFundsClick }: TopHoldingsSummaryProps) {
  const [activeHoldingTab, setActiveHoldingTab] = useState<"all" | "stocks" | "mfs" | "fds">("all");
  const [showBalance, setShowBalance] = useState(true);
  const [availableBalance, setAvailableBalance] = useState<number>(214278.67);
  const [holdingsCount, setHoldingsCount] = useState<number>(0);
  const [positionsCount, setPositionsCount] = useState<number>(0);
  const [totalHoldingsValue, setTotalHoldingsValue] = useState<number>(0);
  const [netPositionsPl, setNetPositionsPl] = useState<number>(0);
  const [showAddModal, setShowAddModal] = useState(false);
  const [depositAmount, setDepositAmount] = useState("50000");

  useEffect(() => {
    async function fetchData() {
      try {
        const [fundsRes, holdingsRes, positionsRes] = await Promise.all([
          getUserFundsDetails(),
          getUserHoldings(),
          getUserPositions(),
        ]);

        if (fundsRes && fundsRes.available_balance !== undefined) {
          setAvailableBalance(fundsRes.available_balance);
        }

        if (holdingsRes && holdingsRes.overall) {
          setHoldingsCount(holdingsRes.overall.count_total || holdingsRes.holdings?.length || 0);
          setTotalHoldingsValue(holdingsRes.overall.total_current_value || 0);
        }

        if (positionsRes && positionsRes.overall) {
          setPositionsCount(positionsRes.overall.count_open || positionsRes.positions?.length || 0);
          setNetPositionsPl(positionsRes.overall.pl_total || 0);
        }
      } catch (err) {
        // Fallback to default
      }
    }
    fetchData();
  }, []);

  // Format amount into Indian compact format: e.g. 214278.67 -> "₹2.14L"
  const formatCompactINR = (amount: number) => {
    if (amount >= 10000000) {
      return `₹${(amount / 10000000).toFixed(2)}Cr`;
    } else if (amount >= 100000) {
      return `₹${(amount / 100000).toFixed(2)}L`;
    } else if (amount >= 1000) {
      return `₹${(amount / 1000).toFixed(1)}k`;
    }
    return `₹${amount.toFixed(2)}`;
  };

  const handleAddFunds = () => {
    if (onAddFundsClick) {
      onAddFundsClick();
    } else {
      setShowAddModal(true);
    }
  };

  return (
    <div className="w-full space-y-2">
      {/* Main Horizontal Top Bar (Groww / Indian Broker Style) */}
      <div className="w-full rounded-2xl bg-[#0e1118]/90 border border-white/[0.08] backdrop-blur-xl shadow-lg shadow-black/40 p-4">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-4 md:gap-0 items-center">
          
          {/* 1. HOLDINGS SECTION */}
          <div className="md:col-span-5 md:pr-5 flex flex-col justify-between space-y-2">
            <div className="flex items-center justify-between">
              <Link
                href="/profile"
                className="group flex items-center gap-1 text-sm font-bold text-white hover:text-indigo-400 transition-colors"
              >
                <span>Holdings</span>
                <ChevronRight className="w-4 h-4 text-slate-400 group-hover:translate-x-0.5 transition-transform" />
              </Link>

              {/* Pills Filter */}
              <div className="flex items-center gap-1 text-[11px]">
                <button
                  onClick={() => setActiveHoldingTab("all")}
                  className={`px-2.5 py-0.5 rounded-full transition-all ${
                    activeHoldingTab === "all"
                      ? "bg-indigo-950/70 text-indigo-400 border border-indigo-500/40 font-semibold"
                      : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  All
                </button>
                <button
                  onClick={() => setActiveHoldingTab("stocks")}
                  className={`px-2 py-0.5 rounded-full transition-all ${
                    activeHoldingTab === "stocks"
                      ? "bg-indigo-950/70 text-indigo-400 border border-indigo-500/40 font-semibold"
                      : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  Stocks & ETFs
                </button>
                <button
                  onClick={() => setActiveHoldingTab("mfs")}
                  className={`px-2 py-0.5 rounded-full transition-all ${
                    activeHoldingTab === "mfs"
                      ? "bg-indigo-950/70 text-indigo-400 border border-indigo-500/40 font-semibold"
                      : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  MFs
                </button>
                <button
                  onClick={() => setActiveHoldingTab("fds")}
                  className={`px-2 py-0.5 rounded-full transition-all ${
                    activeHoldingTab === "fds"
                      ? "bg-indigo-950/70 text-indigo-400 border border-indigo-500/40 font-semibold"
                      : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  FDs
                </button>
              </div>
            </div>

            {/* Content Below */}
            <div className="flex items-center justify-between pt-1">
              {holdingsCount > 0 ? (
                <div className="flex items-center gap-4 text-xs">
                  <div>
                    <span className="text-slate-400 block text-[10px]">Current Value</span>
                    <span className="font-mono font-bold text-white">{formatCompactINR(totalHoldingsValue)}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px]">Assets</span>
                    <span className="text-emerald-400 font-medium">{holdingsCount} Stocks</span>
                  </div>
                </div>
              ) : (
                <>
                  <span className="text-xs text-slate-300 font-normal">
                    You don&apos;t have any Holdings.
                  </span>
                  <Link
                    href="/#watchlist"
                    className="text-xs font-semibold text-indigo-400 hover:text-indigo-300 flex items-center gap-1 transition-colors"
                  >
                    <span>Explore Markets</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </Link>
                </>
              )}
            </div>
          </div>

          {/* Divider */}
          <div className="hidden md:block md:col-span-1 flex justify-center">
            <div className="w-[1px] h-12 bg-white/[0.08] mx-auto" />
          </div>

          {/* 2. POSITIONS SECTION */}
          <div className="md:col-span-3 md:px-3 flex flex-col justify-between space-y-2 border-t md:border-t-0 border-white/[0.06] pt-3 md:pt-0">
            <Link
              href="/#orders"
              className="group flex items-center gap-1 text-sm font-bold text-white hover:text-indigo-400 transition-colors"
            >
              <span>Positions</span>
              <ChevronRight className="w-4 h-4 text-slate-400 group-hover:translate-x-0.5 transition-transform" />
            </Link>

            <div className="pt-1">
              {positionsCount > 0 ? (
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-300">{positionsCount} Open Positions</span>
                  <span className={`font-mono font-bold ${netPositionsPl >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                    {netPositionsPl >= 0 ? "+" : ""}{formatCompactINR(netPositionsPl)}
                  </span>
                </div>
              ) : (
                <span className="text-xs text-slate-400">
                  You don&apos;t have any positions yet.
                </span>
              )}
            </div>
          </div>

          {/* Divider */}
          <div className="hidden md:block md:col-span-1 flex justify-center">
            <div className="w-[1px] h-12 bg-white/[0.08] mx-auto" />
          </div>

          {/* 3. FUNDS SECTION */}
          <div className="md:col-span-2 md:pl-2 flex flex-col justify-between space-y-2 border-t md:border-t-0 border-white/[0.06] pt-3 md:pt-0">
            <div className="flex items-center justify-between">
              <Link
                href="/profile"
                className="group flex items-center gap-1 text-sm font-bold text-white hover:text-indigo-400 transition-colors"
              >
                <span>Funds</span>
                <ChevronRight className="w-4 h-4 text-slate-400 group-hover:translate-x-0.5 transition-transform" />
              </Link>

              {/* Eye Toggle */}
              <button
                onClick={() => setShowBalance(!showBalance)}
                className="text-slate-400 hover:text-slate-200 transition-colors p-1"
                title={showBalance ? "Hide balance" : "Show balance"}
              >
                {showBalance ? (
                  <Eye className="w-4 h-4" />
                ) : (
                  <EyeOff className="w-4 h-4" />
                )}
              </button>
            </div>

            <div className="flex items-baseline justify-between pt-0.5">
              <div>
                <span className="text-[11px] text-slate-400 block leading-tight">
                  Available
                </span>
                <span className="font-mono font-bold text-emerald-400 text-sm sm:text-base leading-tight mt-0.5 block">
                  {showBalance ? formatCompactINR(availableBalance) : "••••••"}
                </span>
              </div>

              {/* + Add Funds Link (dashed underline exactly as in screenshot) */}
              <button
                type="button"
                onClick={handleAddFunds}
                className="text-xs font-semibold text-indigo-400 hover:text-indigo-300 border-b border-dashed border-indigo-400/50 pb-0.5 transition-colors cursor-pointer flex items-center gap-0.5"
              >
                <Plus className="w-3 h-3" />
                <span>Add Funds</span>
              </button>
            </div>
          </div>

        </div>
      </div>

      {/* Sub-banner: "Get 360° View of Your Wealth -> [New]" (shown in screenshot) */}
      <div className="flex items-center gap-2 px-1 text-xs">
        <Link
          href="/profile"
          className="text-indigo-400 hover:text-indigo-300 flex items-center gap-1 font-medium transition-colors"
        >
          <span>Get 360° View of Your Wealth</span>
          <ChevronRight className="w-3.5 h-3.5" />
        </Link>
        <span className="text-[10px] font-bold px-1.5 py-0.2 rounded-full bg-indigo-600 text-white uppercase tracking-wider">
          New
        </span>
      </div>

      {/* Add Funds Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md">
          <div className="neo-card w-full max-w-md p-6 sm:p-8 rounded-3xl border border-white/10 shadow-2xl space-y-5">
            <div className="flex items-center justify-between border-b border-white/5 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
                  <ArrowDownLeft className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">Deposit Trading Funds</h3>
                  <p className="text-[11px] text-slate-400">Instant UPI & Netbanking Pay-in</p>
                </div>
              </div>
              <button
                onClick={() => setShowAddModal(false)}
                className="text-slate-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-300">Deposit Amount (₹)</label>
                <div className="relative">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 font-mono">
                    ₹
                  </span>
                  <input
                    type="number"
                    value={depositAmount}
                    onChange={(e) => setDepositAmount(e.target.value)}
                    className="neo-input w-full pl-8 pr-4 py-2.5 rounded-xl text-sm font-mono text-white focus:outline-none focus:ring-1 focus:ring-emerald-400"
                  />
                </div>
              </div>

              {/* Quick Amount Chips */}
              <div className="flex gap-2">
                {["10000", "25000", "50000", "100000"].map((amt) => (
                  <button
                    key={amt}
                    onClick={() => setDepositAmount(amt)}
                    className="px-3 py-1.5 rounded-lg text-xs font-medium bg-white/5 hover:bg-white/10 border border-white/5 text-slate-300"
                  >
                    +₹{Number(amt).toLocaleString("en-IN")}
                  </button>
                ))}
              </div>

              <div className="p-3.5 rounded-2xl bg-indigo-950/30 border border-indigo-500/20 text-xs text-slate-300 space-y-1">
                <p className="font-semibold text-indigo-300">Direct Fyers Pay-In</p>
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  Funds deposited reflect in real-time in your available trading balance for immediate order placement.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3 pt-2">
                <button
                  onClick={() => setShowAddModal(false)}
                  className="py-2.5 rounded-xl text-xs font-semibold text-slate-300 bg-slate-800 hover:bg-slate-700 transition-colors"
                >
                  Cancel
                </button>
                <a
                  href="https://trade.fyers.in"
                  target="_blank"
                  rel="noreferrer"
                  className="neo-btn py-2.5 rounded-xl text-xs font-bold text-white bg-gradient-to-r from-emerald-500 to-teal-600 flex items-center justify-center gap-1.5 shadow-lg shadow-emerald-500/20"
                >
                  <span>Proceed to Pay</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
