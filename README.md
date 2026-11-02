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

Run tests with `pytest -q`.

## Run automatically for the NSE session

The day runner starts the collector at 09:15 IST on weekdays, analyzes each
selected symbol every five minutes, and stops at 15:30 IST:

```bash
python run_day.py --symbol NSE:NIFTY50-INDEX --symbol NSE:NIFTYBANK-INDEX
```

Keep the terminal open, or use the systemd units below to start a fresh run
each weekday. Keep the computer awake and signed in during market hours.
The runner only prints proposals; it does not open a new paper trade every
five minutes and never places a real order.

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
