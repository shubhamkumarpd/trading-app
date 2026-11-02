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
