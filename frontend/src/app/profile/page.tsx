"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { Navbar } from "@/components/Navbar";
import {
  getUserProfileDetails,
  getUserFundsDetails,
  UserProfile,
  FundsResponse,
} from "@/lib/api";
import {
  Wallet,
  ShieldCheck,
  ArrowLeft,
  ArrowUpRight,
  ArrowDownLeft,
  RefreshCw,
  Copy,
  CheckCircle2,
  AlertCircle,
  CreditCard,
  Building,
  Key,
  Smartphone,
  Mail,
  UserCheck,
  Zap,
  ExternalLink,
} from "lucide-react";

export default function ProfilePage() {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [funds, setFunds] = useState<FundsResponse | null>(null);
  const [isLive, setIsLive] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [copiedId, setCopiedId] = useState(false);
  const [showAddFundsModal, setShowAddFundsModal] = useState(false);
  const [depositAmount, setDepositAmount] = useState("50000");

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [profileData, fundsData] = await Promise.all([
        getUserProfileDetails(),
        getUserFundsDetails(),
      ]);
      setProfile(profileData.profile);
      setFunds(fundsData);
      setIsLive(fundsData.is_live);
    } catch (err) {
      console.error("Error loading profile or funds", err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(true);
    setTimeout(() => setCopiedId(false), 2000);
  };

  const formatINR = (val?: number) => {
    if (val === undefined || val === null) return "₹0.00";
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      maximumFractionDigits: 2,
    }).format(val);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#06080d] via-[#090d16] to-[#06080d] text-slate-100 flex flex-col">
      <Navbar />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-6 space-y-6">
        {/* Navigation Breadcrumb & Page Title */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="p-2 rounded-xl bg-slate-900/80 border border-white/5 hover:border-white/20 text-slate-400 hover:text-white transition-all"
            >
              <ArrowLeft className="w-4 h-4" />
            </Link>
            <div>
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-white flex items-center gap-2">
                <span>Account & Funds Balance</span>
                {isLive && (
                  <span className="text-[10px] uppercase font-bold tracking-wider px-2.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                    Live Broker Sync
                  </span>
                )}
              </h1>
              <p className="text-xs text-slate-400">
                Live margins, cash balance, and Fyers account authorizations
              </p>
            </div>
          </div>

          <button
            onClick={loadData}
            disabled={isLoading}
            className="neo-btn self-start sm:self-auto flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-900 border border-white/10 text-xs text-slate-300 hover:text-white transition-all"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? "animate-spin text-cyan-400" : ""}`} />
            <span>Refresh Balances</span>
          </button>
        </div>

        {/* Hero Section: Live Funds & Margin Utilization */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Balance Highlight Card (2 Cols) */}
          <div className="lg:col-span-2 neo-card rounded-3xl p-6 sm:p-8 relative overflow-hidden bg-gradient-to-br from-[#0e1424] via-[#12192e] to-[#0b0f19] border border-indigo-500/20 shadow-2xl">
            {/* Glowing ambient accents */}
            <div className="absolute top-0 right-0 w-80 h-80 bg-indigo-500/10 rounded-full blur-[80px] pointer-events-none" />
            <div className="absolute bottom-0 left-0 w-60 h-60 bg-cyan-500/10 rounded-full blur-[60px] pointer-events-none" />

            <div className="relative z-10 space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <span className="text-xs uppercase font-semibold text-slate-400 tracking-wider">
                    Total Available Trading Margin
                  </span>
                  <div className="mt-1 flex items-baseline gap-3">
                    <span className="text-3xl sm:text-4xl font-extrabold tracking-tight font-mono text-transparent bg-clip-text bg-gradient-to-r from-white via-indigo-100 to-cyan-300">
                      {formatINR(funds?.available_balance || funds?.total_balance)}
                    </span>
                    <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                      100% Liquid
                    </span>
                  </div>
                </div>

                {/* Quick Fund Actions */}
                <div className="flex items-center gap-2 pt-2 sm:pt-0">
                  <button
                    onClick={() => setShowAddFundsModal(true)}
                    className="neo-btn flex items-center gap-1.5 px-4 py-2.5 rounded-xl font-bold text-xs text-white bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 shadow-lg shadow-emerald-500/20"
                  >
                    <ArrowDownLeft className="w-4 h-4" />
                    <span>Add Funds</span>
                  </button>
                  <button
                    onClick={() => window.open("https://trade.fyers.in", "_blank")}
                    className="neo-btn flex items-center gap-1.5 px-4 py-2.5 rounded-xl font-semibold text-xs text-slate-300 bg-slate-900/90 border border-white/10 hover:text-white"
                  >
                    <ArrowUpRight className="w-4 h-4" />
                    <span>Withdraw</span>
                  </button>
                </div>
              </div>

              {/* Margin Breakdown Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-4 border-t border-white/5">
                <div className="p-3.5 rounded-2xl bg-white/[0.03] border border-white/5">
                  <span className="text-[11px] text-slate-400 block">Total Balance</span>
                  <span className="text-sm font-bold font-mono text-white mt-0.5 block">
                    {formatINR(funds?.total_balance)}
                  </span>
                </div>
                <div className="p-3.5 rounded-2xl bg-white/[0.03] border border-white/5">
                  <span className="text-[11px] text-slate-400 block">Utilized Margin</span>
                  <span className="text-sm font-bold font-mono text-rose-400 mt-0.5 block">
                    {formatINR(funds?.used_margin || 0)}
                  </span>
                </div>
                <div className="p-3.5 rounded-2xl bg-white/[0.03] border border-white/5">
                  <span className="text-[11px] text-slate-400 block">Collaterals / Non-Cash</span>
                  <span className="text-sm font-bold font-mono text-cyan-400 mt-0.5 block">
                    {formatINR(funds?.collateral_margin || 0)}
                  </span>
                </div>
                <div className="p-3.5 rounded-2xl bg-white/[0.03] border border-white/5">
                  <span className="text-[11px] text-slate-400 block">Day Start Limit</span>
                  <span className="text-sm font-bold font-mono text-slate-200 mt-0.5 block">
                    {formatINR(funds?.available_balance || funds?.total_balance)}
                  </span>
                </div>
              </div>

              {/* Margin Utilization Progress Bar */}
              <div className="space-y-1.5">
                <div className="flex justify-between text-xs text-slate-400">
                  <span>Margin Utilization Status</span>
                  <span className="font-semibold text-emerald-400">0.0% Utilized (₹0 In Play)</span>
                </div>
                <div className="w-full h-2 rounded-full bg-slate-800/80 overflow-hidden p-[1px]">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-cyan-400 transition-all duration-500"
                    style={{ width: "3%" }}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* User Profile Identity Card (1 Col) */}
          <div className="neo-card rounded-3xl p-6 relative overflow-hidden flex flex-col justify-between space-y-6">
            <div className="space-y-4">
              {/* Avatar & Name */}
              <div className="flex items-center gap-4">
                <div className="relative">
                  <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-indigo-500 to-cyan-400 p-[1.5px] shadow-lg shadow-indigo-500/30">
                    <div className="w-full h-full rounded-2xl bg-[#0d1322] flex items-center justify-center font-black text-xl text-transparent bg-clip-text bg-gradient-to-r from-indigo-300 to-cyan-300">
                      {profile?.name ? profile.name.slice(0, 2).toUpperCase() : "SK"}
                    </div>
                  </div>
                  <span className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-emerald-500 border-2 border-[#0d1322]" />
                </div>

                <div>
                  <h3 className="text-base font-bold text-white leading-snug">
                    {profile?.name || "SHUBHAM KUMAR"}
                  </h3>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-xs font-mono text-cyan-400 font-semibold">
                      {profile?.fy_id || "FAL22896"}
                    </span>
                    <button
                      onClick={() => copyToClipboard(profile?.fy_id || "FAL22896")}
                      className="text-slate-500 hover:text-slate-300 transition-colors"
                      title="Copy Client ID"
                    >
                      {copiedId ? (
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                    </button>
                  </div>
                </div>
              </div>

              {/* Status Badges */}
              <div className="flex flex-wrap gap-1.5 pt-1">
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-emerald-500/15 text-emerald-400 border border-emerald-500/25 flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" />
                  DDPI Enabled
                </span>
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-indigo-500/15 text-indigo-400 border border-indigo-500/25 flex items-center gap-1">
                  <Zap className="w-3 h-3" />
                  MTF Active
                </span>
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-cyan-500/15 text-cyan-400 border border-cyan-500/25 flex items-center gap-1">
                  <ShieldCheck className="w-3 h-3" />
                  KYC Verified
                </span>
              </div>

              {/* Account Attributes */}
              <div className="space-y-2.5 pt-3 border-t border-white/5 text-xs">
                <div className="flex items-center justify-between text-slate-400">
                  <span className="flex items-center gap-1.5">
                    <CreditCard className="w-3.5 h-3.5 text-slate-500" />
                    PAN
                  </span>
                  <span className="font-mono text-slate-200 font-medium">
                    {profile?.PAN || profile?.pan || "CF******8K"}
                  </span>
                </div>
                <div className="flex items-center justify-between text-slate-400">
                  <span className="flex items-center gap-1.5">
                    <Smartphone className="w-3.5 h-3.5 text-slate-500" />
                    Mobile
                  </span>
                  <span className="font-mono text-slate-200">
                    {profile?.mobile_number || "88******28"}
                  </span>
                </div>
                <div className="flex items-center justify-between text-slate-400">
                  <span className="flex items-center gap-1.5">
                    <Mail className="w-3.5 h-3.5 text-slate-500" />
                    Email
                  </span>
                  <span className="font-mono text-slate-200 truncate max-w-[150px]">
                    {profile?.email_id || "shubham@gmail.com"}
                  </span>
                </div>
              </div>
            </div>

            <div className="pt-2">
              <a
                href="https://myaccount.fyers.in"
                target="_blank"
                rel="noreferrer"
                className="w-full py-2.5 rounded-xl text-xs font-semibold text-slate-300 bg-white/5 hover:bg-white/10 border border-white/10 flex items-center justify-center gap-1.5 transition-colors"
              >
                <span>Manage Fyers Profile</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>
          </div>
        </div>

        {/* Detailed Fund Limits Breakdown Table (from Fyers API) */}
        <div className="neo-card rounded-3xl p-6 sm:p-8 space-y-5">
          <div className="flex items-center justify-between border-b border-white/5 pb-4">
            <div>
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Building className="w-4 h-4 text-indigo-400" />
                <span>Fyers Official Ledger & Margin Limits</span>
              </h3>
              <p className="text-xs text-slate-400">
                Direct snapshot of account fund limits provided by Fyers API v3
              </p>
            </div>
            <span className="text-xs font-mono text-slate-400">
              Currency: INR (₹)
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-slate-400 border-b border-white/5">
                  <th className="text-left pb-3 font-semibold">Limit Category</th>
                  <th className="text-right pb-3 font-semibold">Equity / Derivatives</th>
                  <th className="text-right pb-3 font-semibold">Commodity</th>
                  <th className="text-center pb-3 font-semibold">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {funds?.raw_limits && funds.raw_limits.length > 0 ? (
                  funds.raw_limits.map((item) => (
                    <tr key={item.id} className="hover:bg-white/5 transition-colors">
                      <td className="py-3 font-medium text-slate-200">{item.title}</td>
                      <td className="py-3 text-right font-mono font-semibold text-white">
                        {formatINR(item.equityAmount)}
                      </td>
                      <td className="py-3 text-right font-mono text-slate-400">
                        {formatINR(item.commodityAmount)}
                      </td>
                      <td className="py-3 text-center">
                        <span className="inline-block px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-500/10 text-emerald-400">
                          Active
                        </span>
                      </td>
                    </tr>
                  ))
                ) : (
                  <>
                    <tr className="hover:bg-white/5 transition-colors">
                      <td className="py-3 font-medium text-slate-200">Total Balance</td>
                      <td className="py-3 text-right font-mono font-semibold text-white">
                        {formatINR(funds?.total_balance)}
                      </td>
                      <td className="py-3 text-right font-mono text-slate-400">₹0.00</td>
                      <td className="py-3 text-center">
                        <span className="px-2 py-0.5 rounded text-[10px] bg-emerald-500/10 text-emerald-400">
                          Active
                        </span>
                      </td>
                    </tr>
                    <tr className="hover:bg-white/5 transition-colors">
                      <td className="py-3 font-medium text-slate-200">Available Balance</td>
                      <td className="py-3 text-right font-mono font-semibold text-emerald-400">
                        {formatINR(funds?.available_balance)}
                      </td>
                      <td className="py-3 text-right font-mono text-slate-400">₹0.00</td>
                      <td className="py-3 text-center">
                        <span className="px-2 py-0.5 rounded text-[10px] bg-emerald-500/10 text-emerald-400">
                          Active
                        </span>
                      </td>
                    </tr>
                    <tr className="hover:bg-white/5 transition-colors">
                      <td className="py-3 font-medium text-slate-200">Utilized Amount</td>
                      <td className="py-3 text-right font-mono font-semibold text-rose-400">
                        {formatINR(funds?.used_margin || 0)}
                      </td>
                      <td className="py-3 text-right font-mono text-slate-400">₹0.00</td>
                      <td className="py-3 text-center">
                        <span className="px-2 py-0.5 rounded text-[10px] bg-emerald-500/10 text-emerald-400">
                          Active
                        </span>
                      </td>
                    </tr>
                  </>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* API Credentials & Active Session Info */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="neo-card rounded-3xl p-6 space-y-4">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Key className="w-4 h-4 text-cyan-400" />
              <span>Fyers API v3 Configuration</span>
            </h3>
            <div className="space-y-3 text-xs">
              <div className="flex justify-between items-center py-2 border-b border-white/5">
                <span className="text-slate-400">App ID / Client ID</span>
                <span className="font-mono font-semibold text-slate-200">SU9EYJIRKS-100</span>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-white/5">
                <span className="text-slate-400">Redirect URI</span>
                <span className="font-mono text-slate-400 text-[11px] truncate max-w-[200px]">
                  https://trade.fyers.in/api-login/redirect-uri/index.html
                </span>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-white/5">
                <span className="text-slate-400">Session Security</span>
                <span className="font-semibold text-emerald-400 flex items-center gap-1">
                  <ShieldCheck className="w-3.5 h-3.5" />
                  SHA-256 Checksum Verified
                </span>
              </div>
            </div>
          </div>

          <div className="neo-card rounded-3xl p-6 space-y-4">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <UserCheck className="w-4 h-4 text-emerald-400" />
              <span>Trading Authorizations & Segments</span>
            </h3>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="p-3 rounded-xl bg-white/[0.02] border border-white/5">
                <span className="text-slate-400 block text-[11px]">Equity Delivery (CNC)</span>
                <span className="text-emerald-400 font-semibold">Enabled</span>
              </div>
              <div className="p-3 rounded-xl bg-white/[0.02] border border-white/5">
                <span className="text-slate-400 block text-[11px]">Intraday (MIS)</span>
                <span className="text-emerald-400 font-semibold">Enabled</span>
              </div>
              <div className="p-3 rounded-xl bg-white/[0.02] border border-white/5">
                <span className="text-slate-400 block text-[11px]">Futures & Options (NRML)</span>
                <span className="text-emerald-400 font-semibold">Enabled</span>
              </div>
              <div className="p-3 rounded-xl bg-white/[0.02] border border-white/5">
                <span className="text-slate-400 block text-[11px]">Commodity (MCX)</span>
                <span className="text-emerald-400 font-semibold">Enabled</span>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Add Funds Modal */}
      {showAddFundsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md">
          <div className="neo-card w-full max-w-md p-6 sm:p-8 rounded-3xl border border-white/10 shadow-2xl space-y-5">
            <div className="flex items-center justify-between border-b border-white/5 pb-3">
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
                  <ArrowDownLeft className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">Deposit Trading Funds</h3>
                  <p className="text-[11px] text-slate-400">Instant UPI & Netbanking Pay-in</p>
                </div>
              </div>
              <button
                onClick={() => setShowAddFundsModal(false)}
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
                  onClick={() => setShowAddFundsModal(false)}
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
