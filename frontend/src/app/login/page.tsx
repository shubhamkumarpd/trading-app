"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/store/useAuthStore";
import { getLoginUrl, submitAuthCode, submitManualToken } from "@/lib/api";
import {
  ShieldCheck,
  ExternalLink,
  KeyRound,
  Lock,
  ArrowRight,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Sparkles,
} from "lucide-react";

export default function LoginPage() {
  const router = useRouter();
  const { isAuthenticated, checkAuth } = useAuthStore();

  const [activeTab, setActiveTab] = useState<"oauth" | "token">("oauth");
  const [authCode, setAuthCode] = useState("");
  const [directToken, setDirectToken] = useState("");
  const [loginUrl, setLoginUrl] = useState("");
  const [appId, setAppId] = useState("");
  const [isLoadingUrl, setIsLoadingUrl] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  useEffect(() => {
    if (isAuthenticated) {
      router.push("/");
    }
  }, [isAuthenticated, router]);

  useEffect(() => {
    async function fetchUrl() {
      setIsLoadingUrl(true);
      try {
        const data = await getLoginUrl();
        setLoginUrl(data.login_url);
        setAppId(data.client_id);
      } catch (err: any) {
        setErrorMsg("Failed to generate Fyers login URL. Verify backend connection.");
      } finally {
        setIsLoadingUrl(false);
      }
    }
    fetchUrl();
  }, []);

  const handleOpenFyersOAuth = () => {
    if (loginUrl) {
      window.open(loginUrl, "_blank", "width=600,height=750");
    }
  };

  const handleExchangeAuthCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!authCode.trim()) {
      setErrorMsg("Please enter the authorization code");
      return;
    }
    setErrorMsg("");
    setSuccessMsg("");
    setIsSubmitting(true);

    try {
      // If user pasted full redirect URL, extract auth_code param automatically
      let cleanCode = authCode.trim();
      if (cleanCode.includes("auth_code=")) {
        const urlParams = new URLSearchParams(cleanCode.split("?")[1] || cleanCode);
        cleanCode = urlParams.get("auth_code") || cleanCode;
      }

      await submitAuthCode(cleanCode);
      setSuccessMsg("Authentication successful! Redirecting to dashboard...");
      await checkAuth();
      setTimeout(() => router.push("/"), 1200);
    } catch (err: any) {
      setErrorMsg(err.message || "Failed to exchange auth code");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleManualTokenSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!directToken.trim()) {
      setErrorMsg("Please enter your active Fyers access token");
      return;
    }
    setErrorMsg("");
    setSuccessMsg("");
    setIsSubmitting(true);

    try {
      await submitManualToken(directToken.trim());
      setSuccessMsg("Token validated successfully! Redirecting...");
      await checkAuth();
      setTimeout(() => router.push("/"), 1200);
    } catch (err: any) {
      setErrorMsg(err.message || "Token verification failed");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="relative min-h-screen w-full flex items-center justify-center p-4 bg-gradient-to-br from-[#06080d] via-[#0b101b] to-[#06080d] overflow-hidden text-slate-100">
      {/* 3D Floating Glowing Background Orbs */}
      <div className="absolute -top-32 -left-32 w-96 h-96 rounded-full bg-indigo-600/20 blur-[100px] pointer-events-none animate-pulse" />
      <div className="absolute -bottom-32 -right-32 w-96 h-96 rounded-full bg-cyan-500/20 blur-[100px] pointer-events-none animate-pulse" style={{ animationDelay: "2s" }} />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[32rem] h-[32rem] rounded-full bg-purple-600/10 blur-[130px] pointer-events-none" />

      {/* Main Glassmorphic Card */}
      <div className="relative z-10 w-full max-w-lg">
        <div className="neo-card p-8 sm:p-10 rounded-3xl border border-white/10 backdrop-blur-2xl">
          {/* Header & 3D Logo Badge */}
          <div className="text-center space-y-4 mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-tr from-indigo-500 via-indigo-600 to-cyan-400 p-[1px] shadow-lg shadow-indigo-500/30">
              <div className="w-full h-full rounded-2xl bg-[#0b101b] flex items-center justify-center font-black text-2xl text-transparent bg-clip-text bg-gradient-to-r from-indigo-300 to-cyan-300">
                TP
              </div>
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight bg-gradient-to-r from-white via-slate-200 to-slate-400 bg-clip-text text-transparent">
                TradePro Terminal
              </h1>
              <p className="text-xs text-slate-400 mt-1 flex items-center justify-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
                Institutional Trading Powered by Fyers API v3
              </p>
            </div>
          </div>

          {/* Tab Selector */}
          <div className="grid grid-cols-2 p-1 mb-6 rounded-xl bg-slate-900/60 border border-white/5 text-xs font-semibold">
            <button
              onClick={() => {
                setActiveTab("oauth");
                setErrorMsg("");
              }}
              className={`py-2.5 rounded-lg transition-all ${
                activeTab === "oauth"
                  ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/40"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              Fyers OAuth Login
            </button>
            <button
              onClick={() => {
                setActiveTab("token");
                setErrorMsg("");
              }}
              className={`py-2.5 rounded-lg transition-all ${
                activeTab === "token"
                  ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/40"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              Direct Token Entry
            </button>
          </div>

          {/* Feedback Alerts */}
          {errorMsg && (
            <div className="mb-5 p-3.5 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
              <span>{errorMsg}</span>
            </div>
          )}

          {successMsg && (
            <div className="mb-5 p-3.5 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
              <span>{successMsg}</span>
            </div>
          )}

          {/* Tab 1: Fyers OAuth Login */}
          {activeTab === "oauth" && (
            <div className="space-y-6">
              {/* Step 1: Open OAuth Window */}
              <div className="p-4 rounded-2xl bg-indigo-950/30 border border-indigo-500/20 space-y-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-indigo-300">Step 1: Authenticate with Fyers</span>
                  <span className="text-[10px] text-slate-400 font-mono">App ID: {appId || "Loading..."}</span>
                </div>
                <button
                  type="button"
                  onClick={handleOpenFyersOAuth}
                  disabled={isLoadingUrl || !loginUrl}
                  className="neo-btn w-full py-3 px-4 rounded-xl font-semibold text-xs text-white bg-gradient-to-r from-indigo-500 via-indigo-600 to-cyan-500 flex items-center justify-center gap-2 shadow-lg shadow-indigo-500/25 disabled:opacity-50"
                >
                  {isLoadingUrl ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Loading Fyers Auth...
                    </>
                  ) : (
                    <>
                      <span>Open Fyers Login Window</span>
                      <ExternalLink className="w-4 h-4" />
                    </>
                  )}
                </button>
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  Clicking opens Fyers login. Complete OTP/TOTP verification, and copy the code or redirected URL.
                </p>
              </div>

              {/* Step 2: Paste Auth Code */}
              <form onSubmit={handleExchangeAuthCode} className="space-y-4">
                <div className="space-y-2">
                  <label className="text-xs font-medium text-slate-300 flex items-center justify-between">
                    <span>Step 2: Paste Auth Code or Callback URL</span>
                    <span className="text-[10px] text-slate-500">Auto-parses auth_code</span>
                  </label>
                  <div className="relative">
                    <KeyRound className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                    <input
                      type="text"
                      value={authCode}
                      onChange={(e) => setAuthCode(e.target.value)}
                      placeholder="e.g. eyJhbGciOiJIUzI1NiIsIn..."
                      className="neo-input w-full pl-10 pr-4 py-2.5 rounded-xl text-xs text-white placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-indigo-400"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isSubmitting || !authCode.trim()}
                  className="neo-btn w-full py-3 rounded-xl font-semibold text-xs text-white bg-emerald-600 hover:bg-emerald-500 flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/30 disabled:opacity-50"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Validating Session...
                    </>
                  ) : (
                    <>
                      <span>Activate Trading Session</span>
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </form>
            </div>
          )}

          {/* Tab 2: Direct Access Token */}
          {activeTab === "token" && (
            <form onSubmit={handleManualTokenSubmit} className="space-y-5">
              <div className="space-y-2">
                <label className="text-xs font-medium text-slate-300 flex items-center justify-between">
                  <span>Active Fyers Access Token</span>
                  <span className="text-[10px] text-slate-500">24-hr validity</span>
                </label>
                <div className="relative">
                  <Lock className="absolute left-3.5 top-3 w-4 h-4 text-slate-500" />
                  <textarea
                    rows={4}
                    value={directToken}
                    onChange={(e) => setDirectToken(e.target.value)}
                    placeholder="Paste your 24-hour Fyers access token directly..."
                    className="neo-input w-full pl-10 pr-4 py-2.5 rounded-xl text-xs text-white placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-indigo-400 font-mono resize-none"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={isSubmitting || !directToken.trim()}
                className="neo-btn w-full py-3 rounded-xl font-semibold text-xs text-white bg-indigo-600 hover:bg-indigo-500 flex items-center justify-center gap-2 shadow-lg shadow-indigo-600/30 disabled:opacity-50"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Verifying Token...
                  </>
                ) : (
                  <>
                    <span>Verify & Save Token</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </form>
          )}

          {/* Footer Security Badges */}
          <div className="mt-8 pt-6 border-t border-white/5 flex items-center justify-between text-[11px] text-slate-500">
            <div className="flex items-center gap-1.5 text-emerald-400/90">
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>256-bit Encrypted</span>
            </div>
            <span>Fyers API v3</span>
            <span>SEBI Compliant</span>
          </div>
        </div>
      </div>
    </div>
  );
}
