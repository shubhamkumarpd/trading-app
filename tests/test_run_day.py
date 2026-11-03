from datetime import datetime
from zoneinfo import ZoneInfo

from run_day import in_weekday_session


IST = ZoneInfo("Asia/Kolkata")


def test_session_includes_market_hours_on_weekdays():
    assert in_weekday_session(datetime(2026, 11, 2, 9, 15, tzinfo=IST))
    assert in_weekday_session(datetime(2026, 11, 2, 15, 29, tzinfo=IST))
    assert not in_weekday_session(datetime(2026, 11, 2, 15, 30, tzinfo=IST))


def test_session_excludes_weekends():
    assert not in_weekday_session(datetime(2026, 11, 1, 10, 0, tzinfo=IST))


def test_options_mode_runs_options_main_and_defaults_risk_to_its_own_value():
    from argparse import Namespace
    from pathlib import Path

    from run_day import build_command, cycle_flags

    args = Namespace(timeframe=5, capital=100_000, risk_percent=None, history_days=10,
                     options=True, no_auto_paper=False)
    command = build_command(Path("raw.csv"), "NSE:NIFTY50-INDEX", args, cycle_flags(args))

    assert command[1] == "options_main.py"
    assert "--risk-percent" not in command
    assert "--execute-paper" not in command and "--monitor" in command


def test_index_mode_still_uses_main_with_explicit_risk():
    from argparse import Namespace
    from pathlib import Path

    from run_day import build_command, cycle_flags

    args = Namespace(timeframe=5, capital=100_000, risk_percent=1.0, history_days=10,
                     options=False, no_auto_paper=False)
    command = build_command(Path("raw.csv"), "NSE:NIFTY50-INDEX", args, cycle_flags(args))

    assert command[1] == "main.py"
    assert command[command.index("--risk-percent") + 1] == "1.0"
    assert "--execute-paper" in command
