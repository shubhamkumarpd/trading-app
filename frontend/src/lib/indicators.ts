import type { CandleItem } from "@/lib/api";

export type Num = number | null;

export function sma(values: number[], period: number): Num[] {
  const out: Num[] = new Array(values.length).fill(null);
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= period) sum -= values[i - period];
    if (i >= period - 1) out[i] = sum / period;
  }
  return out;
}

export function ema(values: number[], period: number): Num[] {
  const out: Num[] = new Array(values.length).fill(null);
  if (values.length < period) return out;
  const k = 2 / (period + 1);
  let prev = 0;
  for (let i = 0; i < period; i++) prev += values[i];
  prev /= period;
  out[period - 1] = prev;
  for (let i = period; i < values.length; i++) {
    prev = values[i] * k + prev * (1 - k);
    out[i] = prev;
  }
  return out;
}

/** Wilder RSI, same as TradingView / FYERS charts. */
export function rsi(values: number[], period = 14): Num[] {
  const out: Num[] = new Array(values.length).fill(null);
  if (values.length <= period) return out;
  let gain = 0;
  let loss = 0;
  for (let i = 1; i <= period; i++) {
    const d = values[i] - values[i - 1];
    if (d >= 0) gain += d;
    else loss -= d;
  }
  gain /= period;
  loss /= period;
  out[period] = loss === 0 ? 100 : 100 - 100 / (1 + gain / loss);
  for (let i = period + 1; i < values.length; i++) {
    const d = values[i] - values[i - 1];
    gain = (gain * (period - 1) + Math.max(d, 0)) / period;
    loss = (loss * (period - 1) + Math.max(-d, 0)) / period;
    out[i] = loss === 0 ? 100 : 100 - 100 / (1 + gain / loss);
  }
  return out;
}

export interface MacdResult {
  macd: Num[];
  signal: Num[];
  hist: Num[];
}

export function macd(values: number[], fast = 12, slow = 26, signalPeriod = 9): MacdResult {
  const f = ema(values, fast);
  const s = ema(values, slow);
  const line: Num[] = values.map((_, i) => (f[i] !== null && s[i] !== null ? (f[i] as number) - (s[i] as number) : null));

  // Signal = EMA of the MACD line, starting where the line starts.
  const first = line.findIndex((v) => v !== null);
  const signal: Num[] = new Array(values.length).fill(null);
  if (first >= 0) {
    const tail = line.slice(first) as number[];
    const sig = ema(tail, signalPeriod);
    sig.forEach((v, i) => {
      signal[first + i] = v;
    });
  }
  const hist: Num[] = line.map((v, i) => (v !== null && signal[i] !== null ? v - (signal[i] as number) : null));
  return { macd: line, signal, hist };
}

export interface BollingerResult {
  upper: Num[];
  mid: Num[];
  lower: Num[];
}

export function bollinger(values: number[], period = 20, mult = 2): BollingerResult {
  const mid = sma(values, period);
  const upper: Num[] = new Array(values.length).fill(null);
  const lower: Num[] = new Array(values.length).fill(null);
  for (let i = period - 1; i < values.length; i++) {
    const m = mid[i] as number;
    let v = 0;
    for (let j = i - period + 1; j <= i; j++) v += (values[j] - m) ** 2;
    const sd = Math.sqrt(v / period);
    upper[i] = m + mult * sd;
    lower[i] = m - mult * sd;
  }
  return { upper, mid, lower };
}

const IST_OFFSET = 19800;

/** Session VWAP, reset at the start of every IST trading day. */
export function vwap(candles: CandleItem[]): Num[] {
  const out: Num[] = new Array(candles.length).fill(null);
  let day = -1;
  let pv = 0;
  let vol = 0;
  candles.forEach((c, i) => {
    const d = Math.floor((c.time + IST_OFFSET) / 86400);
    if (d !== day) {
      day = d;
      pv = 0;
      vol = 0;
    }
    const typical = (c.high + c.low + c.close) / 3;
    pv += typical * c.volume;
    vol += c.volume;
    out[i] = vol > 0 ? pv / vol : null; // indices have no volume: no VWAP
  });
  return out;
}

export interface SupertrendResult {
  line: Num[];
  up: boolean[];
}

export function supertrend(candles: CandleItem[], period = 10, mult = 3): SupertrendResult {
  const n = candles.length;
  const line: Num[] = new Array(n).fill(null);
  const up: boolean[] = new Array(n).fill(true);
  if (n <= period) return { line, up };

  const tr: number[] = candles.map((c, i) =>
    i === 0
      ? c.high - c.low
      : Math.max(c.high - c.low, Math.abs(c.high - candles[i - 1].close), Math.abs(c.low - candles[i - 1].close))
  );
  // Wilder ATR
  const atr: Num[] = new Array(n).fill(null);
  let a = 0;
  for (let i = 0; i < period; i++) a += tr[i];
  a /= period;
  atr[period - 1] = a;
  for (let i = period; i < n; i++) {
    a = (a * (period - 1) + tr[i]) / period;
    atr[i] = a;
  }

  let finalUpper = 0;
  let finalLower = 0;
  let trendUp = true;
  for (let i = period - 1; i < n; i++) {
    const hl2 = (candles[i].high + candles[i].low) / 2;
    const basicUpper = hl2 + mult * (atr[i] as number);
    const basicLower = hl2 - mult * (atr[i] as number);
    if (i === period - 1) {
      finalUpper = basicUpper;
      finalLower = basicLower;
    } else {
      const prevClose = candles[i - 1].close;
      finalUpper = basicUpper < finalUpper || prevClose > finalUpper ? basicUpper : finalUpper;
      finalLower = basicLower > finalLower || prevClose < finalLower ? basicLower : finalLower;
      if (trendUp && candles[i].close < finalLower) trendUp = false;
      else if (!trendUp && candles[i].close > finalUpper) trendUp = true;
    }
    up[i] = trendUp;
    line[i] = trendUp ? finalLower : finalUpper;
  }
  return { line, up };
}

/** Heikin Ashi candles (the old chart's HA button just drew normal candles). */
export function heikinAshi(candles: CandleItem[]): CandleItem[] {
  const out: CandleItem[] = [];
  candles.forEach((c, i) => {
    const close = (c.open + c.high + c.low + c.close) / 4;
    const open = i === 0 ? (c.open + c.close) / 2 : (out[i - 1].open + out[i - 1].close) / 2;
    out.push({
      time: c.time,
      open,
      close,
      high: Math.max(c.high, open, close),
      low: Math.min(c.low, open, close),
      volume: c.volume,
    });
  });
  return out;
}
