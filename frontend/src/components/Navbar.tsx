"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/store/useAuthStore";
import {
  LogOut,
  User,
  ShieldAlert,
  LogIn,
  ChevronDown,
  Wallet,
  LineChart,
} from "lucide-react";

export function Navbar() {
  const router = useRouter();
  const { isAuthenticated, user, logout } = useAuthStore();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [showLogoutModal, setShowLogoutModal] = useState(false);

  const handleLogout = async () => {
    await logout();
    setShowLogoutModal(false);
    setDropdownOpen(false);
    router.push("/login");
  };

  return (
    <>
      <header className="sticky top-0 z-50 w-full border-b border-white/5 bg-[#0b0f19]/80 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          {/* Logo & Brand */}
          <div className="flex items-center gap-6">
            <Link href="/" className="flex items-center gap-3 group">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-500 to-cyan-400 p-[1px] shadow-lg shadow-indigo-500/20 group-hover:scale-105 transition-transform">
                <div className="w-full h-full rounded-xl bg-[#0d1322] flex items-center justify-center font-black text-lg text-transparent bg-clip-text bg-gradient-to-r from-indigo-300 to-cyan-300">
                  TP
                </div>
              </div>
              <div>
                <span className="font-bold text-base tracking-tight text-white block">
                  TradePro
                </span>
                <span className="text-[10px] text-slate-400 font-mono -mt-1 block">
                  Fyers v3 Engine
                </span>
              </div>
            </Link>

            {/* Live Market Status Tag */}
            <div className="hidden md:flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
              <span className="font-medium">Market Active</span>
            </div>
          </div>

          {/* Navigation Links */}
          <nav className="hidden lg:flex items-center gap-1 text-xs font-medium text-slate-400">
            <Link
              href="/"
              className="px-3 py-1.5 rounded-lg hover:text-white hover:bg-white/5 transition-colors"
            >
              Dashboard
            </Link>
            <Link
              href="/chart"
              className="px-3 py-1.5 rounded-lg text-white bg-white/5 hover:bg-white/10 transition-colors flex items-center gap-1.5"
            >
              <LineChart className="w-3.5 h-3.5 text-indigo-400" />
              <span>Chart Terminal</span>
            </Link>
            <Link
              href="/profile"
              className="px-3 py-1.5 rounded-lg hover:text-white hover:bg-white/5 transition-colors flex items-center gap-1.5"
            >
              <Wallet className="w-3.5 h-3.5 text-cyan-400" />
              <span>Funds & Profile</span>
            </Link>
            <Link
              href="/#watchlist"
              className="px-3 py-1.5 rounded-lg hover:text-white hover:bg-white/5 transition-colors"
            >
              Watchlist
            </Link>
          </nav>

          {/* User Account / Auth Section */}
          <div className="flex items-center gap-3">
            {isAuthenticated ? (
              <div className="relative">
                <button
                  onClick={() => setDropdownOpen(!dropdownOpen)}
                  className="neo-btn flex items-center gap-2.5 px-3 py-1.5 rounded-xl bg-slate-900/80 border border-white/10 hover:border-indigo-500/40 text-xs text-slate-200 transition-all"
                >
                  <div className="w-7 h-7 rounded-lg bg-gradient-to-tr from-indigo-500 to-cyan-500 flex items-center justify-center font-bold text-white text-xs shadow-sm">
                    {user?.name ? user.name.slice(0, 2).toUpperCase() : user?.fy_id?.slice(0, 2) || "SK"}
                  </div>
                  <div className="text-left hidden sm:block">
                    <p className="font-semibold text-white leading-tight">
                      {user?.name || user?.fy_id || "Shubham Kumar"}
                    </p>
                    <p className="text-[10px] text-emerald-400 font-mono">
                      {user?.fy_id || "FAL22896"} • Active
                    </p>
                  </div>
                  <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
                </button>

                {/* Dropdown Menu */}
                {dropdownOpen && (
                  <div className="absolute right-0 mt-2 w-60 rounded-2xl neo-card p-2 border border-white/10 shadow-2xl backdrop-blur-2xl z-50">
                    <div className="px-3 py-2 border-b border-white/5 mb-1">
                      <p className="text-xs font-semibold text-white">
                        {user?.name || "Shubham Kumar"}
                      </p>
                      <p className="text-[10px] text-slate-400 truncate">
                        {user?.email_id || user?.fy_id || "Fyers Connected"}
                      </p>
                    </div>

                    <div className="py-1 text-xs">
                      <Link
                        href="/chart"
                        onClick={() => setDropdownOpen(false)}
                        className="w-full flex items-center gap-2 px-3 py-2 text-slate-300 hover:text-white hover:bg-white/5 rounded-xl transition-colors"
                      >
                        <LineChart className="w-3.5 h-3.5 text-indigo-400" />
                        <span>Open Chart Terminal</span>
                      </Link>
                      <Link
                        href="/profile"
                        onClick={() => setDropdownOpen(false)}
                        className="w-full flex items-center gap-2 px-3 py-2 text-slate-300 hover:text-white hover:bg-white/5 rounded-xl transition-colors"
                      >
                        <User className="w-3.5 h-3.5 text-indigo-400" />
                        <span>Profile & Funds Details</span>
                      </Link>
                    </div>

                    <div className="border-t border-white/5 pt-1 mt-1">
                      <button
                        onClick={() => {
                          setDropdownOpen(false);
                          setShowLogoutModal(true);
                        }}
                        className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium text-rose-400 hover:bg-rose-500/10 rounded-xl transition-colors"
                      >
                        <LogOut className="w-3.5 h-3.5" />
                        <span>Log Out</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <Link
                  href="/chart"
                  className="px-3 py-2 rounded-xl text-xs font-medium text-slate-300 hover:text-white hover:bg-white/5 transition-all hidden sm:flex items-center gap-1.5"
                >
                  <LineChart className="w-3.5 h-3.5 text-indigo-400" />
                  <span>Chart</span>
                </Link>
                <Link
                  href="/login"
                  className="neo-btn flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 shadow-md shadow-indigo-600/30 transition-all"
                >
                  <LogIn className="w-3.5 h-3.5" />
                  <span>Login with Fyers</span>
                </Link>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Logout Confirmation Modal */}
      {showLogoutModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="neo-card w-full max-w-sm p-6 rounded-3xl border border-white/10 shadow-2xl text-center space-y-4">
            <div className="w-12 h-12 mx-auto rounded-2xl bg-rose-500/20 border border-rose-500/30 flex items-center justify-center text-rose-400">
              <ShieldAlert className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">Disconnect Session?</h3>
              <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                Logging out will clear active Fyers API credentials from memory.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowLogoutModal(false)}
                className="py-2.5 rounded-xl text-xs font-semibold text-slate-300 bg-slate-800/80 hover:bg-slate-700/80 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleLogout}
                className="py-2.5 rounded-xl text-xs font-semibold text-white bg-rose-600 hover:bg-rose-500 shadow-lg shadow-rose-600/30 transition-colors"
              >
                Confirm Logout
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
