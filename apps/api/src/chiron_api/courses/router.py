from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from chiron_api.auth.dependencies import require_roles
from chiron_api.courses.schemas import (
    CatalogCourseResponse,
    CatalogSessionResponse,
    CourseCreate,
    CourseResponse,
    CourseSessionCreate,
    CourseSessionResponse,
    CourseSessionUpdate,
    CourseUpdate,
    LocationCreate,
    LocationResponse,
    LocationUpdate,
)
from chiron_api.db.models import (
    Booking,
    BookingStatus,
    Course,
    CourseSession,
    CourseStatus,
    Location,
    User,
    UserRole,
)
from chiron_api.db.session import get_db_session

router = APIRouter(tags=["courses"])

backoffice_user = Depends(require_roles(UserRole.ADMIN, UserRole.STAFF))


def get_location_or_404(db: Session, location_id: UUID) -> Location:
    location = db.get(Location, location_id)
    if location is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Location not found")
    return location


def get_course_or_404(db: Session, course_id: UUID) -> Course:
    course = db.get(Course, course_id)
    if course is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Course not found")
    return course


def get_session_or_404(db: Session, session_id: UUID) -> CourseSession:
    course_session = db.get(CourseSession, session_id)
    if course_session is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")
    return course_session


def ensure_time_order(starts_at, ends_at) -> None:
    if starts_at >= ends_at:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Session end time must be after start time",
        )


@router.post(
    "/admin/locations",
    response_model=LocationResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_location(
    payload: LocationCreate,
    _: User = backoffice_user,
    db: Session = Depends(get_db_session),
) -> Location:
    location = Location(**payload.model_dump())
    db.add(location)
    db.commit()
    db.refresh(location)
    return location


@router.get("/admin/locations", response_model=list[LocationResponse])
def list_locations(
    _: User = backoffice_user,
    db: Session = Depends(get_db_session),
) -> list[Location]:
    return list(db.scalars(select(Location).order_by(Location.name)).all())


@router.patch("/admin/locations/{location_id}", response_model=LocationResponse)
def update_location(
    location_id: UUID,
    payload: LocationUpdate,
    _: User = backoffice_user,
    db: Session = Depends(get_db_session),
) -> Location:
    location = get_location_or_404(db, location_id)
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(location, field, value)

    db.add(location)
    db.commit()
    db.refresh(location)
    return location


@router.delete("/admin/locations/{location_id}", response_model=LocationResponse)
def deactivate_location(
    location_id: UUID,
    _: User = backoffice_user,
    db: Session = Depends(get_db_session),
) -> Location:
    location = get_location_or_404(db, location_id)
    location.is_active = False
    db.add(location)
    db.commit()
    db.refresh(location)
    return location


@router.post("/admin/courses", response_model=CourseResponse, status_code=status.HTTP_201_CREATED)
def create_course(
    payload: CourseCreate,
    _: User = backoffice_user,
    db: Session = Depends(get_db_session),
) -> Course:
    get_location_or_404(db, payload.location_id)
    course = Course(**payload.model_dump())
    db.add(course)
    db.commit()
    db.refresh(course)
    return course


@router.get("/admin/courses", response_model=list[CourseResponse])
def list_admin_courses(
    _: User = backoffice_user,
    db: Session = Depends(get_db_session),
) -> list[Course]:
    return list(db.scalars(select(Course).order_by(Course.title)).all())


@router.patch("/admin/courses/{course_id}", response_model=CourseResponse)
def update_course(
    course_id: UUID,
    payload: CourseUpdate,
    _: User = backoffice_user,
    db: Session = Depends(get_db_session),
) -> Course:
    course = get_course_or_404(db, course_id)
    data = payload.model_dump(exclude_unset=True)
    if "location_id" in data:
        get_location_or_404(db, data["location_id"])

    for field, value in data.items():
        setattr(course, field, value)

    db.add(course)
    db.commit()
    db.refresh(course)
    return course


@router.delete("/admin/courses/{course_id}", response_model=CourseResponse)
def archive_course(
    course_id: UUID,
    _: User = backoffice_user,
    db: Session = Depends(get_db_session),
) -> Course:
    course = get_course_or_404(db, course_id)
    course.status = CourseStatus.ARCHIVED
    db.add(course)
    db.commit()
    db.refresh(course)
    return course


@router.post(
    "/admin/courses/{course_id}/sessions",
    response_model=CourseSessionResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_course_session(
    course_id: UUID,
    payload: CourseSessionCreate,
    _: User = backoffice_user,
    db: Session = Depends(get_db_session),
) -> CourseSession:
    get_course_or_404(db, course_id)
    ensure_time_order(payload.starts_at, payload.ends_at)
    course_session = CourseSession(course_id=course_id, **payload.model_dump())
    db.add(course_session)
    db.commit()
    db.refresh(course_session)
    return course_session


@router.patch("/admin/course-sessions/{session_id}", response_model=CourseSessionResponse)
def update_course_session(
    session_id: UUID,
    payload: CourseSessionUpdate,
    _: User = backoffice_user,
    db: Session = Depends(get_db_session),
) -> CourseSession:
    course_session = get_session_or_404(db, session_id)
    data = payload.model_dump(exclude_unset=True)
    starts_at = data.get("starts_at", course_session.starts_at)
    ends_at = data.get("ends_at", course_session.ends_at)
    ensure_time_order(starts_at, ends_at)

    for field, value in data.items():
        setattr(course_session, field, value)

    db.add(course_session)
    db.commit()
    db.refresh(course_session)
    return course_session


@router.delete("/admin/course-sessions/{session_id}", response_model=CourseSessionResponse)
def deactivate_course_session(
    session_id: UUID,
    _: User = backoffice_user,
    db: Session = Depends(get_db_session),
) -> CourseSession:
    course_session = get_session_or_404(db, session_id)
    course_session.is_active = False
    db.add(course_session)
    db.commit()
    db.refresh(course_session)
    return course_session


def confirmed_booking_count(db: Session, course_session_id: UUID) -> int:
    return (
        db.scalar(
            select(func.count(Booking.id)).where(
                Booking.course_session_id == course_session_id,
                Booking.status == BookingStatus.CONFIRMED,
            ),
        )
        or 0
    )


@router.get("/courses", response_model=list[CatalogCourseResponse])
def list_catalog_courses(
    location_id: UUID | None = None,
    weekday: int | None = Query(default=None, ge=0, le=6),
    available: bool | None = None,
    db: Session = Depends(get_db_session),
) -> list[CatalogCourseResponse]:
    query = (
        select(Course)
        .join(Course.location)
        .where(Course.status == CourseStatus.PUBLISHED, Location.is_active.is_(True))
        .order_by(Course.title)
    )
    if location_id is not None:
        query = query.where(Course.location_id == location_id)

    catalog_courses: list[CatalogCourseResponse] = []
    for course in db.scalars(query).unique().all():
        catalog_sessions: list[CatalogSessionResponse] = []
        for course_session in course.sessions:
            if not course_session.is_active:
                continue
            if weekday is not None and course_session.weekday != weekday:
                continue

            booked_spots = confirmed_booking_count(db, course_session.id)
            available_spots = max(course_session.capacity - booked_spots, 0)
            if available is True and available_spots <= 0:
                continue
            if available is False and available_spots > 0:
                continue

            catalog_sessions.append(
                CatalogSessionResponse(
                    id=course_session.id,
                    weekday=course_session.weekday,
                    starts_at=course_session.starts_at,
                    ends_at=course_session.ends_at,
                    capacity=course_session.capacity,
                    available_spots=available_spots,
                ),
            )

        if catalog_sessions:
            catalog_courses.append(
                CatalogCourseResponse(
                    id=course.id,
                    location_id=course.location_id,
                    location_name=course.location.name,
                    title=course.title,
                    description=course.description,
                    sessions=catalog_sessions,
                ),
            )

    return catalog_courses

