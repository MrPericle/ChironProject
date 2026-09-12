from datetime import UTC, date, datetime
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import and_, case, distinct, func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from chiron_api.admin.schemas import (
    AdminCourseSessionAttendeeResponse,
    AdminCourseSessionAvailabilityResponse,
    AdminStatsItem,
    AdminStatsResponse,
    AdminSubscriptionCreate,
    AdminSubscriptionUpdate,
    AdminUserCreate,
    AdminUserResponse,
    AdminUserSubscriptionResponse,
    AdminUserUpdate,
)
from chiron_api.auth.dependencies import require_roles
from chiron_api.auth.passwords import hash_password
from chiron_api.auth.tokens import revoke_user_refresh_tokens
from chiron_api.bookings.service import cancel_active_user_bookings
from chiron_api.config import Settings, get_settings
from chiron_api.courses.scheduling import sunday_based_weekday
from chiron_api.db.models import (
    Booking,
    BookingStatus,
    Course,
    CourseSession,
    CourseStatus,
    Location,
    Subscription,
    User,
    UserProfile,
    UserRole,
    UserStatus,
)
from chiron_api.db.session import get_db_session
from chiron_api.subscriptions.service import is_subscription_active_on, latest_user_subscription

router = APIRouter(prefix="/admin", tags=["admin"])

backoffice_user = Depends(require_roles(UserRole.ADMIN, UserRole.STAFF))
admin_user = Depends(require_roles(UserRole.ADMIN))


def normalize_email(email: str) -> str:
    return email.strip().lower()


def get_user_or_404(db: Session, user_id: UUID) -> User:
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    return user


def subscription_response(subscription: Subscription) -> AdminUserSubscriptionResponse:
    today = datetime.now(UTC).date()
    return AdminUserSubscriptionResponse(
        id=subscription.id,
        starts_on=subscription.starts_on,
        duration_days=subscription.duration_days,
        expires_on=subscription.expires_on,
        is_active=is_subscription_active_on(
            subscription.starts_on,
            subscription.duration_days,
            today,
        ),
    )


def user_response(db: Session, user: User) -> AdminUserResponse:
    subscription = latest_user_subscription(db, user.id)
    profile = user.profile
    return AdminUserResponse(
        id=user.id,
        email=user.email,
        role=user.role,
        status=user.status,
        first_name=profile.first_name if profile is not None else None,
        last_name=profile.last_name if profile is not None else None,
        phone=profile.phone if profile is not None else None,
        birth_date=profile.birth_date if profile is not None else None,
        subscription=subscription_response(subscription) if subscription is not None else None,
    )


@router.get("/users", response_model=list[AdminUserResponse])
def list_users(
    _: User = admin_user,
    db: Session = Depends(get_db_session),
) -> list[AdminUserResponse]:
    users = db.scalars(select(User).order_by(User.email)).unique().all()
    return [user_response(db, user) for user in users]


@router.post("/users", response_model=AdminUserResponse, status_code=status.HTTP_201_CREATED)
def create_user(
    payload: AdminUserCreate,
    _: User = admin_user,
    db: Session = Depends(get_db_session),
) -> AdminUserResponse:
    user = User(
        email=normalize_email(payload.email),
        password_hash=hash_password(payload.password),
        role=payload.role,
    )
    user.profile = UserProfile(
        first_name=payload.first_name,
        last_name=payload.last_name,
        phone=payload.phone,
        birth_date=payload.birth_date,
    )
    db.add(user)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Email already registered",
        ) from exc

    db.refresh(user)
    return user_response(db, user)


@router.patch("/users/{user_id}", response_model=AdminUserResponse)
def update_user(
    user_id: UUID,
    payload: AdminUserUpdate,
    _: User = admin_user,
    db: Session = Depends(get_db_session),
    settings: Settings = Depends(get_settings),
) -> AdminUserResponse:
    user = get_user_or_404(db, user_id)
    data = payload.model_dump(exclude_unset=True)
    profile_fields = {"first_name", "last_name", "phone", "birth_date"}

    if "email" in data:
        user.email = normalize_email(data["email"])
    if "role" in data:
        next_role = data["role"]
        if user.role != next_role:
            user.role = next_role
            revoke_user_refresh_tokens(db, user.id)
    if "status" in data:
        user.status = data["status"]
        if user.status in (UserStatus.DISABLED, UserStatus.DELETED):
            cancel_active_user_bookings(db, user_id=user.id, settings=settings)
        if user.status != UserStatus.DELETED:
            user.deleted_at = None

    if profile_fields.intersection(data):
        if user.profile is None:
            user.profile = UserProfile(first_name="", last_name="")
        for field in profile_fields.intersection(data):
            setattr(user.profile, field, data[field])
        db.add(user.profile)

    db.add(user)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Email already registered",
        ) from exc

    db.refresh(user)
    return user_response(db, user)


@router.delete("/users/{user_id}", response_model=AdminUserResponse)
def delete_user(
    user_id: UUID,
    _: User = admin_user,
    db: Session = Depends(get_db_session),
    settings: Settings = Depends(get_settings),
) -> AdminUserResponse:
    user = get_user_or_404(db, user_id)
    user.status = UserStatus.DELETED
    user.deleted_at = datetime.now(UTC)
    user.email = f"deleted-{user.id}@deleted.local"
    cancel_active_user_bookings(db, user_id=user.id, settings=settings)
    db.add(user)
    db.commit()
    db.refresh(user)
    return user_response(db, user)


@router.post(
    "/users/{user_id}/subscriptions",
    response_model=AdminUserSubscriptionResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_user_subscription(
    user_id: UUID,
    payload: AdminSubscriptionCreate,
    _: User = admin_user,
    db: Session = Depends(get_db_session),
) -> AdminUserSubscriptionResponse:
    get_user_or_404(db, user_id)
    subscription = Subscription(
        user_id=user_id,
        starts_on=payload.starts_on,
        duration_days=payload.duration_days,
    )
    db.add(subscription)
    db.commit()
    db.refresh(subscription)
    return subscription_response(subscription)


@router.patch("/subscriptions/{subscription_id}", response_model=AdminUserSubscriptionResponse)
def update_subscription(
    subscription_id: UUID,
    payload: AdminSubscriptionUpdate,
    _: User = admin_user,
    db: Session = Depends(get_db_session),
) -> AdminUserSubscriptionResponse:
    subscription = db.get(Subscription, subscription_id)
    if subscription is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Subscription not found",
        )

    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(subscription, field, value)

    db.add(subscription)
    db.commit()
    db.refresh(subscription)
    return subscription_response(subscription)


@router.get("/stats", response_model=AdminStatsResponse)
def admin_stats(
    _: User = backoffice_user,
    db: Session = Depends(get_db_session),
) -> AdminStatsResponse:
    today = datetime.now(UTC).date()
    active_member_ids: set[UUID] = set()
    subscriptions = db.scalars(
        select(Subscription).join(User).where(User.status == UserStatus.ACTIVE),
    ).all()
    for subscription in subscriptions:
        if is_subscription_active_on(
            subscription.starts_on,
            subscription.duration_days,
            today,
        ):
            active_member_ids.add(subscription.user_id)

    course_rows = db.execute(
        select(Course.id, Course.title, func.count(distinct(Booking.user_id)))
        .join(CourseSession, CourseSession.course_id == Course.id)
        .join(Booking, Booking.course_session_id == CourseSession.id)
        .where(Booking.status == BookingStatus.CONFIRMED)
        .group_by(Course.id, Course.title)
        .order_by(func.count(distinct(Booking.user_id)).desc(), Course.title),
    ).all()
    location_rows = db.execute(
        select(Location.id, Location.name, func.count(distinct(Booking.user_id)))
        .join(Course, Course.location_id == Location.id)
        .join(CourseSession, CourseSession.course_id == Course.id)
        .join(Booking, Booking.course_session_id == CourseSession.id)
        .where(Booking.status == BookingStatus.CONFIRMED)
        .group_by(Location.id, Location.name)
        .order_by(func.count(distinct(Booking.user_id)).desc(), Location.name),
    ).all()

    return AdminStatsResponse(
        active_members=len(active_member_ids),
        courses=[
            AdminStatsItem(id=row[0], name=row[1], member_count=row[2])
            for row in course_rows
        ],
        locations=[
            AdminStatsItem(id=row[0], name=row[1], member_count=row[2])
            for row in location_rows
        ],
    )


@router.get(
    "/calendar/availability",
    response_model=list[AdminCourseSessionAvailabilityResponse],
)
def list_calendar_availability(
    occurs_on: date = Query(),
    _: User = backoffice_user,
    db: Session = Depends(get_db_session),
) -> list[AdminCourseSessionAvailabilityResponse]:
    weekday = sunday_based_weekday(occurs_on)
    course_sessions = list(
        db.scalars(
            select(CourseSession)
            .join(Course, Course.id == CourseSession.course_id)
            .where(
                CourseSession.is_active.is_(True),
                Course.status != CourseStatus.ARCHIVED,
                or_(
                    CourseSession.occurs_on == occurs_on,
                    and_(
                        CourseSession.occurs_on.is_(None),
                        CourseSession.weekday == weekday,
                    ),
                ),
            )
            .order_by(CourseSession.starts_at, CourseSession.id)
        ).all()
    )
    if not course_sessions:
        return []

    session_ids = [course_session.id for course_session in course_sessions]
    booking_counts = {
        (session_id, booking_status): count
        for session_id, booking_status, count in db.execute(
            select(Booking.course_session_id, Booking.status, func.count(Booking.id))
            .where(
                Booking.course_session_id.in_(session_ids),
                Booking.occurs_on == occurs_on,
                Booking.status.in_([BookingStatus.CONFIRMED, BookingStatus.WAITLISTED]),
            )
            .group_by(Booking.course_session_id, Booking.status)
        ).all()
    }

    return [
        AdminCourseSessionAvailabilityResponse(
            course_session_id=course_session.id,
            occurs_on=occurs_on,
            capacity=course_session.capacity,
            confirmed_count=booking_counts.get(
                (course_session.id, BookingStatus.CONFIRMED),
                0,
            ),
            waitlisted_count=booking_counts.get(
                (course_session.id, BookingStatus.WAITLISTED),
                0,
            ),
            available_spots=max(
                course_session.capacity
                - booking_counts.get((course_session.id, BookingStatus.CONFIRMED), 0),
                0,
            ),
        )
        for course_session in course_sessions
    ]


@router.get(
    "/course-sessions/{course_session_id}/attendees",
    response_model=list[AdminCourseSessionAttendeeResponse],
)
def list_course_session_attendees(
    course_session_id: UUID,
    occurs_on: date = Query(),
    _: User = backoffice_user,
    db: Session = Depends(get_db_session),
) -> list[AdminCourseSessionAttendeeResponse]:
    if db.get(CourseSession, course_session_id) is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Course session not found",
        )

    status_order = case(
        (Booking.status == BookingStatus.CONFIRMED, 0),
        (Booking.status == BookingStatus.WAITLISTED, 1),
        else_=2,
    )
    rows = db.execute(
        select(Booking, User, UserProfile)
        .join(User, User.id == Booking.user_id)
        .outerjoin(UserProfile, UserProfile.user_id == User.id)
        .where(
            Booking.course_session_id == course_session_id,
            Booking.occurs_on == occurs_on,
            Booking.status != BookingStatus.CANCELLED,
        )
        .order_by(
            status_order,
            UserProfile.last_name,
            UserProfile.first_name,
            User.email,
        ),
    ).all()

    return [
        AdminCourseSessionAttendeeResponse(
            booking_id=booking.id,
            user_id=user.id,
            email=user.email,
            first_name=profile.first_name if profile is not None else None,
            last_name=profile.last_name if profile is not None else None,
            status=booking.status,
        )
        for booking, user, profile in rows
    ]
