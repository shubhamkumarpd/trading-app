const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export interface UserProfile {
  name?: string;
  email_id?: string;
  fy_id?: string;
  mobile_number?: string;
  pan?: string;
  PAN?: string;
  pin_change_date?: string;
  pwd_change_date?: string;
  totp?: boolean;
  ddpi_enabled?: boolean;
  mtf_enabled?: boolean;
  pwd_to_expire?: number;
}

export interface AuthStatusResponse {
  authenticated: boolean;
  user: UserProfile | null;
  app_id: string;
  redirect_uri: string;
}

export interface FundLimitItem {
  id: number;
  title: string;
  equityAmount: number;
  commodityAmount: number;
}

export interface FundsResponse {
  status: string;
  is_live: boolean;
  available_balance: number;
  used_margin: number;
  collateral_margin: number;
  total_balance: number;
  raw_limits?: FundLimitItem[];
}

export interface HoldingsResponse {
  status: string;
  is_live: boolean;
  overall: {
    count_total?: number;
    total_current_value?: number;
    total_investment?: number;
    total_pl?: number;
    pnl_perc?: number;
  };
  holdings: any[];
}

export interface PositionsResponse {
  status: string;
  is_live: boolean;
  overall: {
    count_open?: number;
    count_total?: number;
    pl_realized?: number;
    pl_total?: number;
    pl_unrealized?: number;
  };
  positions: any[];
}

export interface IndexQuoteItem {
  symbol: string;
  name: string;
  category: string;
  exchange: string;
  ltp: number;
  change: number;
  change_percent: number;
  high: number;
  low: number;
  open: number;
  prev_close: number;
}

export interface IndicesResponse {
  status: string;
  is_live: boolean;
  indices: IndexQuoteItem[];
}

export interface CandleItem {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface HistoryResponse {
  status: string;
  is_live: boolean;
  symbol: string;
  resolution: string;
  candles: CandleItem[];
}

export interface MarketDepthResponse {
  status: string;
  is_live: boolean;
  symbol: string;
  depth: {
    totalbuyqty?: number;
    totalsellqty?: number;
    bids?: Array<{ price: number; volume: number; orders?: number }>;
    ask?: Array<{ price: number; volume: number; orders?: number }>;
    lower_ckt?: number;
    upper_ckt?: number;
    ltp?: number;
    o?: number;
    h?: number;
    l?: number;
    c?: number;
    v?: number;
  };
}

export interface ProfileDetailResponse {
  status: string;
  is_live: boolean;
  profile: UserProfile;
  app_id: string;
}

export async function getAuthStatus(): Promise<AuthStatusResponse> {
  const res = await fetch(`${API_BASE}/api/auth/status`, { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to fetch auth status");
  return res.json();
}

export async function getLoginUrl(): Promise<{ login_url: string; client_id: string; redirect_uri: string }> {
  const res = await fetch(`${API_BASE}/api/auth/login-url`, { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to get Fyers login URL");
  return res.json();
}

export async function submitAuthCode(authCode: string): Promise<any> {
  const res = await fetch(`${API_BASE}/api/auth/callback`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ auth_code: authCode }),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.detail || "Authentication with auth code failed");
  }
  return data;
}

export async function submitManualToken(token: string): Promise<any> {
  const res = await fetch(`${API_BASE}/api/auth/manual-token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ access_token: token }),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.detail || "Failed to verify access token");
  }
  return data;
}

export async function logoutUser(): Promise<any> {
  const res = await fetch(`${API_BASE}/api/auth/logout`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  });
  return res.json();
}

export async function getUserProfileDetails(): Promise<ProfileDetailResponse> {
  const res = await fetch(`${API_BASE}/api/user/profile`, { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to fetch profile details");
  return res.json();
}

export async function getUserFundsDetails(): Promise<FundsResponse> {
  const res = await fetch(`${API_BASE}/api/user/funds`, { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to fetch fund details");
  return res.json();
}

export async function getUserHoldings(): Promise<HoldingsResponse> {
  const res = await fetch(`${API_BASE}/api/user/holdings`, { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to fetch holdings");
  return res.json();
}

export async function getUserPositions(): Promise<PositionsResponse> {
  const res = await fetch(`${API_BASE}/api/user/positions`, { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to fetch positions");
  return res.json();
}

export async function getIndicesQuotes(): Promise<IndicesResponse> {
  const res = await fetch(`${API_BASE}/api/market/indices`, { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to fetch indices quotes");
  return res.json();
}

export async function getSymbolHistory(
  symbol: string,
  resolution: string = "15",
  days: number = 7
): Promise<HistoryResponse> {
  const res = await fetch(
    `${API_BASE}/api/market/history?symbol=${encodeURIComponent(symbol)}&resolution=${resolution}&days=${days}`,
    { cache: "no-store" }
  );
  if (!res.ok) throw new Error("Failed to fetch candle history");
  return res.json();
}

export async function getMarketDepth(symbol: string): Promise<MarketDepthResponse> {
  const res = await fetch(`${API_BASE}/api/market/depth?symbol=${encodeURIComponent(symbol)}`, {
    cache: "no-store",
  });
  if (!res.ok) throw new Error("Failed to fetch market depth");
  return res.json();
}
