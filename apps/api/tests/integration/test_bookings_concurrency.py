import os
from concurrent.futures import ThreadPoolExecutor
from datetime import date, time, timedelta
from uuid import uuid4

import pytest
from fastapi import HTTPException
from sqlalchemy import create_engine, func, select
from sqlalchemy.orm import sessionmaker

from chiron_api.bookings.service import create_booking
from chiron_api.config import Settings
from chiron_api.db.base import Base
from chiron_api.db.models import (
    Booking,
    BookingStatus,
    Course,
    CourseSession,
    CourseStatus,
    Location,
    Subscription,
    User,
)

pytestmark = pytest.mark.skipif(
    not os.getenv("BOOKING_DATABASE_URL"),
    reason="BOOKING_DATABASE_URL is required for PostgreSQL concurrency tests",
)


def test_concurrent_booking_never_overbooks_postgresql() -> None:
    admin_engine = create_engine(os.environ["BOOKING_DATABASE_URL"])
    schema = f"booking_test_{uuid4().hex}"
    with admin_engine.begin() as connection:
        connection.exec_driver_sql(f'CREATE SCHEMA "{schema}"')

    engine = create_engine(
        os.environ["BOOKING_DATABASE_URL"],
        connect_args={"options": f"-csearch_path={schema}"},
        pool_size=8,
        max_overflow=0,
    )
    Base.metadata.create_all(bind=engine)

    session_factory = sessionmaker(
        bind=engine,
        autoflush=False,
        autocommit=False,
        expire_on_commit=False,
    )

    try:
        with session_factory() as session:
            location = Location(name="Chiron Test", address="Via Test", city="Roma")
            course = Course(location=location, title="Concurrent", status=CourseStatus.PUBLISHED)
            course_session = CourseSession(
                course=course,
                weekday=6,
                starts_at=time(23, 59),
                ends_at=time(23, 59, 59),
                capacity=1,
                cancellation_deadline_hours=0,
            )
            users = [
                User(email=f"user-{index}@example.com", password_hash="test")
                for index in range(8)
            ]
            session.add_all([location, course, course_session, *users])
            session.flush()
            session.add_all(
                [
                    Subscription(
                        user_id=user.id,
                        starts_on=date.today() - timedelta(days=1),
                        duration_days=30,
                    )
                    for user in users
                ],
            )
            session.commit()
            session.refresh(course_session)
            user_ids = [user.id for user in users]
            course_session_id = course_session.id

        def attempt_booking(user_id):
            with session_factory() as session:
                user = session.get(User, user_id)
                try:
                    return create_booking(
                        session,
                        user=user,
                        course_session_id=course_session_id,
                        settings=Settings(WAITLIST_ENABLED=False),
                    ).status
                except HTTPException:
                    return "conflict"

        with ThreadPoolExecutor(max_workers=8) as executor:
            results = list(executor.map(attempt_booking, user_ids))

        with session_factory() as session:
            confirmed_count = session.scalar(
                select(func.count(Booking.id)).where(Booking.status == BookingStatus.CONFIRMED),
            )

        assert results.count(BookingStatus.CONFIRMED) == 1
        assert results.count("conflict") == 7
        assert confirmed_count == 1
    finally:
        engine.dispose()
        with admin_engine.begin() as connection:
            connection.exec_driver_sql(f'DROP SCHEMA IF EXISTS "{schema}" CASCADE')
        admin_engine.dispose()
