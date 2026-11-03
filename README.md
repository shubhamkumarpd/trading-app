# FYERS Paper Trading App

This project collects FYERS market data and produces **paper-trading**
proposals. It does not submit real orders.

## Setup

1. Create a virtual environment and install dependencies:
   `python -m pip install -r requirements.txt`
2. Copy `.env.example` to `.env` and add FYERS credentials.
3. Run `python auth.py` to generate `token.txt`.

## Analyze an existing candle file

```bash
python main.py --candles data/candles/candles_YYYY-MM-DD_5m.csv \
  --symbol NSE:NIFTY50-INDEX
```

The command prints market analysis, a signal, and an independent risk decision.
It does not create a trade unless `--execute-paper` is supplied. That option only
writes a simulated trade to `logs/trades`; it never contacts the broker.

## Build candles from raw ticks and analyze them

```bash
python main.py --raw data/raw/market_data_YYYY-MM-DD.csv \
  --symbol NSE:NIFTY50-INDEX --timeframe 5
```

### Warm-up, trade monitoring and daily loss

- `--history-days N` prepends `N` days of FYERS history so EMA 50 is ready at
  the open. Without it the first signal can only appear about 250 minutes
  (50 candles) after the collector starts. History is cached once per day in
  `data/processed`; if it cannot be fetched the analysis still runs and a
  warning goes to stderr.
- `--monitor` closes open paper trades for the symbol when a candle that
  started after entry touches the stop-loss or target. If one candle touches
  both, the stop-loss wins; a gap through the stop fills at the open.
- `--square-off` closes the symbol's open paper trades at the latest close and
  exits (end of day).
- Cash, open positions and the daily loss are rebuilt from today's
  `logs/trades` file, so they carry over between runs. `--daily-loss` is only
  needed to override the value read from the log. A symbol cannot have two open
  paper positions at once.

Run tests with `pytest -q`.

## Run automatically for the NSE session

The day runner starts the collector at 09:15 IST on weekdays, analyzes each
selected symbol every five minutes, and stops at 15:30 IST:

```bash
python run_day.py --symbol NSE:NIFTY50-INDEX --symbol NSE:NIFTYBANK-INDEX
```

(For NIFTY weekly options use `--options`, described below.) Each cycle first runs `--monitor` (history warm-up defaults to 10 days; pass
`--history-days 0` to disable it), and any paper trades still open when the
session ends are squared off at the last close.

Keep the terminal open, or use the systemd units below to start a fresh run
each weekday. Keep the computer awake and signed in during market hours.
Each cycle opens a paper trade when the signal is approved by the risk check
(at most one open position per symbol) and logs it to `logs/trades`, so you can
review the analysis accuracy afterwards. Pass `--no-auto-paper` to only print
proposals. It never places a real order.

Create `~/.config/systemd/user/fyers-paper-day.service` with this content
(replace the Python path if your virtual environment is elsewhere):

```ini
[Unit]
Description=FYERS paper-trading day runner

[Service]
Type=oneshot
WorkingDirectory=/home/shubham/Desktop/trading-app
ExecStart=/home/shubham/Desktop/trading-app/venv/bin/python run_day.py --symbol NSE:NIFTY50-INDEX --symbol NSE:NIFTYBANK-INDEX

```

Create `~/.config/systemd/user/fyers-paper-day.timer` with:

```ini
[Unit]
Description=Start FYERS paper day runner on NSE weekdays

[Timer]
OnCalendar=Mon..Fri 09:00:00 Asia/Kolkata
Persistent=true

[Install]
WantedBy=timers.target
```

Enable the timer once with:

```bash
systemctl --user daemon-reload
systemctl --user enable --now fyers-paper-day.timer
systemctl --user list-timers fyers-paper-day.timer
```


## NIFTY weekly option paper trading (buyer)

NSE now lists weekly options only on NIFTY 50 (expiry every Tuesday; a holiday
moves it to the previous trading day), so the option flow trades NIFTY only. The
index candles decide direction: bullish buys a CE, bearish buys a PE. The
contract is chosen from the FYERS option chain, bought at the **ask**, and
stop-loss and target are set on the **premium**.

```bash
python run_day.py --options --symbol NSE:NIFTY50-INDEX
# or one cycle by hand:
python options_main.py --raw data/raw/market_data_YYYY-MM-DD.csv --monitor
python options_main.py --raw data/raw/market_data_YYYY-MM-DD.csv --square-off
```

Rules and defaults (all flags on `options_main.py`):

| Rule | Default |
| --- | --- |
| Contract | ATM, nearest weekly expiry (`--strike-offset` for ITM steps of 50) |
| Lot size | 65 (`--lot-size`; check NSE circulars, it gets revised) |
| Max loss per trade | 3% of capital (`--risk-percent`, capped at 5) |
| Stop / target | -30% / +60% of premium (`--sl-pct`, `--reward-multiple`) |
| Lots | at most 1 (`--max-lots`) |
| Spread filter | skip if bid-ask spread is above 3% |
| Expiry day | no entries (`--allow-expiry-day` to enable) |
| Entries | none after 14:45 IST; one open position at a time |
| After a stop-loss | 30 minute cooldown |
| Daily loss limit | 5% of capital |
| Exit fills | 0.5% below the trigger price (selling at the bid) |
| Charges | brokerage, STT 0.15% on sells, exchange, SEBI, stamp, GST |

Holidays are not built in: pass `--holiday YYYY-MM-DD` (repeatable) so expiry
dates shift correctly. Positions are intraday only and are squared off at the
end of the session.

When a trade opens, the contract is added to `data/watch_symbols_<date>.txt`;
the collector subscribes to it within about five seconds and records its ticks,
which is what lets `--monitor` see the stop or target. The first candle after
entry is the earliest one that can close the trade.

### Logs

- `logs/trades/trade_history_<date>.csv` gains option columns (type, strike,
  expiry, DTE, lot size, index level at entry, spread, signal confidence).
  Older daily files are upgraded automatically.
- `logs/decisions/decisions_<date>.csv` has one row per cycle, including
  NO_TRADE, SKIPPED (position open, cooldown, chain unavailable) and REJECTED
  (spread, risk, cutoff).
- `app.reports.decision_accuracy.evaluate_decisions` scores the index calls
  against what NIFTY did 15, 30 and 60 minutes later, and
  `TradePerformance` now reports expectancy, average win/loss and max drawdown.

### Not verified yet

The FYERS option chain call and its response layout, and the collector
subscribing to option contracts during a live session, have only been tested
with fixtures. Watch one full live session end to end before trusting results, and compare the charge model with a real contract note.
The strategy itself has not been backtested.
