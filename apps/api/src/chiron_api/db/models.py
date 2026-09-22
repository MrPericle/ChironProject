from datetime import UTC, date, datetime, time, timedelta
from enum import StrEnum
from typing import Any
from uuid import UUID, uuid4

from sqlalchemy import (
    JSON,
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    Enum,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    Text,
    Time,
    UniqueConstraint,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.types import Uuid

from chiron_api.db.base import Base


def utc_now() -> datetime:
    return datetime.now(UTC)


def subscription_expiry_date(starts_on: date, duration_days: int) -> date:
    return starts_on + timedelta(days=duration_days)


class UserRole(StrEnum):
    ADMIN = "admin"
    STAFF = "staff"
    USER = "user"


class UserStatus(StrEnum):
    ACTIVE = "active"
    DISABLED = "disabled"
    DELETED = "deleted"


class CourseStatus(StrEnum):
    DRAFT = "draft"
    PUBLISHED = "published"
    ARCHIVED = "archived"


class CourseDiscipline(StrEnum):
    GYM = "Sala"
    MARTIAL_ARTS = "Arti marziali"
    POLE = "Pole"
    OTHER = "Altro"


class BookingStatus(StrEnum):
    CONFIRMED = "confirmed"
    CANCELLED = "cancelled"
    WAITLISTED = "waitlisted"


class WorkoutPlanStatus(StrEnum):
    DRAFT = "draft"
    PUBLISHED = "published"
    ARCHIVED = "archived"


def enum_values(enum_type: type[StrEnum]) -> list[str]:
    return [member.value for member in enum_type]


class User(Base):
    __tablename__ = "users"
    __table_args__ = (UniqueConstraint("email", name="uq_users_email"),)

    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, default=uuid4)
    email: Mapped[str] = mapped_column(String(320), index=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[UserRole] = mapped_column(
        Enum(UserRole, name="user_role", values_callable=enum_values),
        default=UserRole.USER,
        nullable=False,
    )
    status: Mapped[UserStatus] = mapped_column(
        Enum(UserStatus, name="user_status", values_callable=enum_values),
        default=UserStatus.ACTIVE,
        nullable=False,
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=utc_now,
        onupdate=utc_now,
    )
    email_verified_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        default=utc_now,
    )
    pending_email: Mapped[str | None] = mapped_column(String(320))
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    profile: Mapped["UserProfile | None"] = relationship(
        back_populates="user",
        cascade="all, delete-orphan",
        single_parent=True,
    )
    bookings: Mapped[list["Booking"]] = relationship(
        back_populates="user",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )
    subscriptions: Mapped[list["Subscription"]] = relationship(
        back_populates="user",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )
    refresh_tokens: Mapped[list["RefreshToken"]] = relationship(
        back_populates="user",
        cascade="all, delete-orphan",
    )
    admin_2fa: Mapped["AdminTwoFactor | None"] = relationship(
        back_populates="user",
        cascade="all, delete-orphan",
        single_parent=True,
    )
    account_action_tokens: Mapped[list["AccountActionToken"]] = relationship(
        back_populates="user",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )
    workout_plans_created: Mapped[list["WorkoutPlan"]] = relationship(
        back_populates="created_by",
        foreign_keys="WorkoutPlan.created_by_id",
    )
    workout_logs: Mapped[list["WorkoutLog"]] = relationship(
        back_populates="user",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )
    workout_plan_assignments: Mapped[list["WorkoutPlanAssignment"]] = relationship(
        back_populates="user",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )

    @property
    def email_verified(self) -> bool:
        return self.email_verified_at is not None


class UserProfile(Base):
    __tablename__ = "user_profiles"

    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, default=uuid4)
    user_id: Mapped[UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), unique=True)
    first_name: Mapped[str] = mapped_column(String(120), nullable=False)
    last_name: Mapped[str] = mapped_column(String(120), nullable=False)
    phone: Mapped[str | None] = mapped_column(String(40))
    birth_date: Mapped[date | None] = mapped_column(Date)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=utc_now,
        onupdate=utc_now,
    )

    user: Mapped[User] = relationship(back_populates="profile")


class AdminTwoFactor(Base):
    __tablename__ = "admin_2fa"

    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, default=uuid4)
    user_id: Mapped[UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), unique=True)
    secret_encrypted: Mapped[str] = mapped_column(String(255), nullable=False)
    confirmed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)

    user: Mapped[User] = relationship(back_populates="admin_2fa")


class Location(Base):
    __tablename__ = "locations"

    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, default=uuid4)
    name: Mapped[str] = mapped_column(String(180), nullable=False)
    address: Mapped[str] = mapped_column(String(255), nullable=False)
    city: Mapped[str] = mapped_column(String(120), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=utc_now,
        onupdate=utc_now,
    )

    courses: Mapped[list["Course"]] = relationship(back_populates="location")


class CourseDisciplineOption(Base):
    __tablename__ = "course_disciplines"
    __table_args__ = (
        Index("uq_course_disciplines_name_lower", text("lower(name)"), unique=True),
    )

    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, default=uuid4)
    name: Mapped[str] = mapped_column(String(80), nullable=False)
    sort_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    is_default: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)


class Course(Base):
    __tablename__ = "courses"
    __table_args__ = (UniqueConstraint("location_id", "title", name="uq_courses_location_title"),)

    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, default=uuid4)
    location_id: Mapped[UUID] = mapped_column(ForeignKey("locations.id", ondelete="RESTRICT"))
    instructor_user_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"),
    )
    title: Mapped[str] = mapped_column(String(180), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    discipline: Mapped[str] = mapped_column(
        String(80),
        default=CourseDiscipline.OTHER.value,
        nullable=False,
    )
    image_url: Mapped[str | None] = mapped_column(String(500))
    requires_active_subscription: Mapped[bool] = mapped_column(
        Boolean,
        default=True,
        nullable=False,
    )
    status: Mapped[CourseStatus] = mapped_column(
        Enum(CourseStatus, name="course_status", values_callable=enum_values),
        default=CourseStatus.DRAFT,
        nullable=False,
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=utc_now,
        onupdate=utc_now,
    )

    location: Mapped[Location] = relationship(back_populates="courses")
    instructor: Mapped[User | None] = relationship()
    sessions: Mapped[list["CourseSession"]] = relationship(
        back_populates="course",
        cascade="all, delete-orphan",
        order_by=lambda: (CourseSession.weekday, CourseSession.starts_at),
    )


class CourseSession(Base):
    __tablename__ = "course_sessions"
    __table_args__ = (
        CheckConstraint("weekday >= 0 AND weekday <= 6", name="weekday_range"),
        CheckConstraint("capacity > 0", name="capacity_positive"),
        CheckConstraint("ends_at > starts_at", name="time_order"),
        CheckConstraint("cancellation_deadline_hours >= 0", name="cancellation_deadline_positive"),
        Index(
            "uq_active_course_session_schedule",
            "course_id",
            "weekday",
            "starts_at",
            "ends_at",
            unique=True,
            postgresql_where=text("is_active = true AND occurs_on IS NULL"),
            sqlite_where=text("is_active = 1 AND occurs_on IS NULL"),
        ),
        Index(
            "uq_active_single_course_session_schedule",
            "course_id",
            "occurs_on",
            "starts_at",
            "ends_at",
            unique=True,
            postgresql_where=text("is_active = true AND occurs_on IS NOT NULL"),
            sqlite_where=text("is_active = 1 AND occurs_on IS NOT NULL"),
        ),
    )

    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, default=uuid4)
    course_id: Mapped[UUID] = mapped_column(ForeignKey("courses.id", ondelete="CASCADE"))
    weekday: Mapped[int] = mapped_column(Integer, nullable=False)
    occurs_on: Mapped[date | None] = mapped_column(Date)
    starts_at: Mapped[time] = mapped_column(Time, nullable=False)
    ends_at: Mapped[time] = mapped_column(Time, nullable=False)
    capacity: Mapped[int] = mapped_column(Integer, nullable=False)
    cancellation_deadline_hours: Mapped[int] = mapped_column(Integer, default=24, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=utc_now,
        onupdate=utc_now,
    )

    course: Mapped[Course] = relationship(back_populates="sessions")
    bookings: Mapped[list["Booking"]] = relationship(
        back_populates="course_session",
        cascade="all, delete-orphan",
    )


class Booking(Base):
    __tablename__ = "bookings"
    __table_args__ = (
        UniqueConstraint(
            "user_id",
            "course_session_id",
            "occurs_on",
            name="uq_bookings_user_session_date",
        ),
    )

    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, default=uuid4)
    user_id: Mapped[UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    course_session_id: Mapped[UUID] = mapped_column(
        ForeignKey("course_sessions.id", ondelete="CASCADE"),
    )
    occurs_on: Mapped[date] = mapped_column(Date, nullable=False)
    status: Mapped[BookingStatus] = mapped_column(
        Enum(BookingStatus, name="booking_status", values_callable=enum_values),
        default=BookingStatus.CONFIRMED,
        nullable=False,
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    cancelled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    user: Mapped[User] = relationship(back_populates="bookings")
    course_session: Mapped[CourseSession] = relationship(back_populates="bookings")


class RefreshToken(Base):
    __tablename__ = "refresh_tokens"
    __table_args__ = (UniqueConstraint("token_hash", name="uq_refresh_tokens_token_hash"),)

    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, default=uuid4)
    user_id: Mapped[UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    token_hash: Mapped[str] = mapped_column(String(64), index=True, nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)

    user: Mapped[User] = relationship(back_populates="refresh_tokens")


class Subscription(Base):
    __tablename__ = "subscriptions"
    __table_args__ = (CheckConstraint("duration_days > 0", name="duration_days_positive"),)

    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, default=uuid4)
    user_id: Mapped[UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    starts_on: Mapped[date] = mapped_column(Date, nullable=False)
    duration_days: Mapped[int] = mapped_column(Integer, default=30, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)

    user: Mapped[User] = relationship(back_populates="subscriptions")

    @property
    def expires_on(self) -> date:
        return subscription_expiry_date(self.starts_on, self.duration_days)


class AccountActionToken(Base):
    __tablename__ = "account_action_tokens"
    __table_args__ = (UniqueConstraint("token_hash", name="uq_account_action_tokens_token_hash"),)

    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, default=uuid4)
    user_id: Mapped[UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    purpose: Mapped[str] = mapped_column(String(40), index=True, nullable=False)
    token_hash: Mapped[str] = mapped_column(String(64), index=True, nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)

    user: Mapped[User] = relationship(back_populates="account_action_tokens")


class WorkoutPlan(Base):
    __tablename__ = "workout_plans"
    __table_args__ = (Index("ix_workout_plans_status_updated_at", "status", "updated_at"),)

    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, default=uuid4)
    title: Mapped[str] = mapped_column(String(180), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    status: Mapped[WorkoutPlanStatus] = mapped_column(
        Enum(WorkoutPlanStatus, name="workout_plan_status", values_callable=enum_values),
        default=WorkoutPlanStatus.DRAFT,
        nullable=False,
    )
    created_by_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"),
        index=True,
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=utc_now,
        onupdate=utc_now,
    )

    created_by: Mapped[User | None] = relationship(
        back_populates="workout_plans_created",
        foreign_keys=[created_by_id],
    )
    days: Mapped[list["WorkoutDay"]] = relationship(
        back_populates="plan",
        cascade="all, delete-orphan",
        order_by="WorkoutDay.position",
    )
    logs: Mapped[list["WorkoutLog"]] = relationship(back_populates="plan")
    assignments: Mapped[list["WorkoutPlanAssignment"]] = relationship(
        back_populates="plan",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )


class WorkoutDay(Base):
    __tablename__ = "workout_days"
    __table_args__ = (Index("ix_workout_days_plan_position", "plan_id", "position"),)

    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, default=uuid4)
    plan_id: Mapped[UUID] = mapped_column(ForeignKey("workout_plans.id", ondelete="CASCADE"))
    label: Mapped[str] = mapped_column(String(80), nullable=False)
    title: Mapped[str | None] = mapped_column(String(180))
    position: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    is_archived: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    plan: Mapped[WorkoutPlan] = relationship(back_populates="days")
    exercises: Mapped[list["WorkoutExercise"]] = relationship(
        back_populates="day",
        cascade="all, delete-orphan",
        order_by="WorkoutExercise.position",
    )
    logs: Mapped[list["WorkoutLog"]] = relationship(back_populates="day")


class WorkoutExercise(Base):
    __tablename__ = "workout_exercises"
    __table_args__ = (
        CheckConstraint("sets_planned > 0", name="sets_planned_positive"),
        CheckConstraint(
            "rest_seconds IS NULL OR rest_seconds >= 0", name="rest_seconds_non_negative"
        ),
        Index("ix_workout_exercises_day_position", "day_id", "position"),
    )

    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, default=uuid4)
    day_id: Mapped[UUID] = mapped_column(ForeignKey("workout_days.id", ondelete="CASCADE"))
    name: Mapped[str] = mapped_column(String(180), nullable=False)
    sets_planned: Mapped[int] = mapped_column(Integer, nullable=False)
    reps_planned: Mapped[str] = mapped_column(String(40), nullable=False)
    rest_seconds: Mapped[int | None] = mapped_column(Integer)
    notes: Mapped[str | None] = mapped_column(String(500))
    position: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    is_archived: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    day: Mapped[WorkoutDay] = relationship(back_populates="exercises")
    log_entries: Mapped[list["WorkoutLogEntry"]] = relationship(back_populates="exercise")


class WorkoutPlanAssignment(Base):
    __tablename__ = "workout_plan_assignments"
    __table_args__ = (
        UniqueConstraint("plan_id", "user_id", name="uq_workout_plan_assignments_plan_user"),
    )

    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, default=uuid4)
    plan_id: Mapped[UUID] = mapped_column(ForeignKey("workout_plans.id", ondelete="CASCADE"))
    user_id: Mapped[UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    assigned_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)

    plan: Mapped[WorkoutPlan] = relationship(back_populates="assignments")
    user: Mapped[User] = relationship(back_populates="workout_plan_assignments")


class WorkoutLog(Base):
    __tablename__ = "workout_logs"
    __table_args__ = (
        Index("ix_workout_logs_user_date", "user_id", "workout_date"),
        Index("ix_workout_logs_plan_day", "plan_id", "day_id"),
        CheckConstraint("rating IS NULL OR (rating >= 1 AND rating <= 5)", name="rating_range"),
    )

    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, default=uuid4)
    user_id: Mapped[UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    plan_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("workout_plans.id", ondelete="SET NULL")
    )
    day_id: Mapped[UUID | None] = mapped_column(ForeignKey("workout_days.id", ondelete="SET NULL"))
    workout_date: Mapped[date] = mapped_column(Date, nullable=False)
    general_note: Mapped[str | None] = mapped_column(String(2000))
    rating: Mapped[int | None] = mapped_column(Integer)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=utc_now,
        onupdate=utc_now,
    )

    user: Mapped[User] = relationship(back_populates="workout_logs")
    plan: Mapped[WorkoutPlan | None] = relationship(back_populates="logs")
    day: Mapped[WorkoutDay | None] = relationship(back_populates="logs")
    entries: Mapped[list["WorkoutLogEntry"]] = relationship(
        back_populates="log",
        cascade="all, delete-orphan",
        order_by="(WorkoutLogEntry.exercise_id, WorkoutLogEntry.set_number)",
    )


class WorkoutLogEntry(Base):
    __tablename__ = "workout_log_entries"
    __table_args__ = (
        CheckConstraint("set_number > 0", name="set_number_positive"),
        CheckConstraint("repetitions > 0", name="repetitions_positive"),
        CheckConstraint("load_kg >= 0 AND load_kg <= 1000", name="load_kg_range"),
        Index("ix_workout_log_entries_log_id", "log_id"),
    )

    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, default=uuid4)
    log_id: Mapped[UUID] = mapped_column(ForeignKey("workout_logs.id", ondelete="CASCADE"))
    exercise_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("workout_exercises.id", ondelete="SET NULL"),
    )
    exercise_name_snapshot: Mapped[str] = mapped_column(String(180), nullable=False)
    set_number: Mapped[int] = mapped_column(Integer, nullable=False)
    repetitions: Mapped[int] = mapped_column(Integer, nullable=False)
    load_kg: Mapped[float] = mapped_column(Numeric(7, 2), nullable=False)
    note: Mapped[str | None] = mapped_column(String(500))

    log: Mapped[WorkoutLog] = relationship(back_populates="entries")
    exercise: Mapped[WorkoutExercise | None] = relationship(back_populates="log_entries")


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, default=uuid4)
    actor_user_id: Mapped[UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    action: Mapped[str] = mapped_column(String(120), nullable=False)
    entity_type: Mapped[str] = mapped_column(String(120), nullable=False)
    entity_id: Mapped[UUID | None] = mapped_column(Uuid)
    metadata_json: Mapped[dict[str, Any] | None] = mapped_column(JSON)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
