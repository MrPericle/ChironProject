from datetime import UTC, datetime
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import case, distinct, func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from chiron_api.admin.schemas import (
    AdminCourseSessionAttendeeResponse,
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
from chiron_api.db.models import (
    Booking,
    BookingStatus,
    Course,
    CourseSession,
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
    _: User = backoffice_user,
    db: Session = Depends(get_db_session),
) -> list[AdminUserResponse]:
    users = db.scalars(select(User).order_by(User.email)).unique().all()
    return [user_response(db, user) for user in users]


@router.post("/users", response_model=AdminUserResponse, status_code=status.HTTP_201_CREATED)
def create_user(
    payload: AdminUserCreate,
    _: User = backoffice_user,
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
    _: User = backoffice_user,
    db: Session = Depends(get_db_session),
) -> AdminUserResponse:
    user = get_user_or_404(db, user_id)
    data = payload.model_dump(exclude_unset=True)
    profile_fields = {"first_name", "last_name", "phone", "birth_date"}

    if "email" in data:
        user.email = normalize_email(data["email"])
    if "role" in data:
        user.role = data["role"]
    if "status" in data:
        user.status = data["status"]
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
    _: User = backoffice_user,
    db: Session = Depends(get_db_session),
) -> AdminUserResponse:
    user = get_user_or_404(db, user_id)
    user.status = UserStatus.DELETED
    user.deleted_at = datetime.now(UTC)
    user.email = f"deleted-{user.id}@deleted.local"
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
    _: User = backoffice_user,
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
    _: User = backoffice_user,
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
    active_members = 0
    for subscription in db.scalars(select(Subscription)).all():
        if is_subscription_active_on(
            subscription.starts_on,
            subscription.duration_days,
            today,
        ):
            active_members += 1

    course_rows = db.execute(
        select(Course.id, Course.title, func.count(distinct(Booking.user_id)))
        .join(CourseSession, CourseSession.course_id == Course.id)
        .join(Booking, Booking.course_session_id == CourseSession.id)
        .where(Booking.status != BookingStatus.CANCELLED)
        .group_by(Course.id, Course.title)
        .order_by(func.count(distinct(Booking.user_id)).desc(), Course.title),
    ).all()
    location_rows = db.execute(
        select(Location.id, Location.name, func.count(distinct(Booking.user_id)))
        .join(Course, Course.location_id == Location.id)
        .join(CourseSession, CourseSession.course_id == Course.id)
        .join(Booking, Booking.course_session_id == CourseSession.id)
        .where(Booking.status != BookingStatus.CANCELLED)
        .group_by(Location.id, Location.name)
        .order_by(func.count(distinct(Booking.user_id)).desc(), Location.name),
    ).all()

    return AdminStatsResponse(
        active_members=active_members,
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
    "/course-sessions/{course_session_id}/attendees",
    response_model=list[AdminCourseSessionAttendeeResponse],
)
def list_course_session_attendees(
    course_session_id: UUID,
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
