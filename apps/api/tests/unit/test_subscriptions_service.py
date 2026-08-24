from datetime import date

from chiron_api.subscriptions.service import calculate_expiry_date, is_subscription_active_on


def test_calculate_expiry_date_uses_start_plus_duration() -> None:
    assert calculate_expiry_date(date(2026, 8, 1), 30) == date(2026, 8, 31)


def test_calculate_expiry_date_supports_custom_duration() -> None:
    assert calculate_expiry_date(date(2026, 2, 1), 90) == date(2026, 5, 2)


def test_subscription_activity_is_informative_only() -> None:
    starts_on = date(2026, 8, 1)

    assert is_subscription_active_on(starts_on, 30, date(2026, 8, 30)) is True
    assert is_subscription_active_on(starts_on, 30, date(2026, 8, 31)) is True
    assert is_subscription_active_on(starts_on, 30, date(2026, 9, 1)) is False

