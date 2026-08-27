from collections.abc import Iterator
from datetime import UTC, date, datetime, time, timedelta
from zoneinfo import ZoneInfo


def local_today(timezone_name: str) -> date:
    return datetime.now(ZoneInfo(timezone_name)).date()


def sunday_based_weekday(value: date) -> int:
    return (value.weekday() + 1) % 7


def occurrence_start_at(
    occurs_on: date,
    starts_at: time,
    timezone_name: str,
) -> datetime:
    local_start = datetime.combine(occurs_on, starts_at, tzinfo=ZoneInfo(timezone_name))
    return local_start.astimezone(UTC)


def occurrence_dates(
    weekday: int,
    *,
    starts_on: date,
    ends_on: date,
) -> Iterator[date]:
    offset = (weekday - sunday_based_weekday(starts_on)) % 7
    current = starts_on + timedelta(days=offset)
    while current <= ends_on:
        yield current
        current += timedelta(days=7)
