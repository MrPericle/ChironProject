from datetime import UTC, date, datetime, timedelta
from pathlib import Path
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload

from chiron_api.auth.dependencies import require_roles
from chiron_api.bookings.service import confirmed_booking_count, max_confirmed_booking_count
from chiron_api.config import Settings, get_settings
from chiron_api.courses.scheduling import (
    local_today,
    occurrence_dates,
    occurrence_start_at,
    sunday_based_weekday,
)
from chiron_api.courses.schemas import (
    CatalogCourseResponse,
    CatalogSessionResponse,
    CourseCreate,
    CourseDeleteResponse,
    CourseDisciplineCreate,
    CourseDisciplineResponse,
    CourseResponse,
    CourseScheduleBatchCreate,
    CourseScheduleCreate,
    CourseSessionCreate,
    CourseSessionResponse,
    CourseSessionUpdate,
    CourseUpdate,
    LocationCascadeResponse,
    LocationCreate,
    LocationDeleteResponse,
    LocationResponse,
    LocationUpdate,
)
from chiron_api.db.models import (
    Course,
    CourseDisciplineOption,
    CourseSession,
    CourseStatus,
    Location,
    User,
    UserRole,
)
from chiron_api.db.session import get_db_session

router = APIRouter(tags=["courses"])

backoffice_user = Depends(require_roles(UserRole.ADMIN, UserRole.STAFF))
admin_user = Depends(require_roles(UserRole.ADMIN))
allowed_course_image_types = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
}
max_course_image_bytes = 5 * 1024 * 1024


def get_location_or_404(db: Session, location_id: UUID) -> Location:
    location = db.get(Location, location_id)
    if location is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Location not found")
    return location


def get_active_location_or_422(db: Session, location_id: UUID) -> Location:
    location = get_location_or_404(db, location_id)
    if not location.is_active:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="La sede selezionata non e attiva.",
        )
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


def normalize_course_title(title: str) -> str:
    return " ".join(title.strip().split())


def normalize_discipline_name(name: str) -> str:
    return " ".join(name.strip().split())


def registered_discipline_name(db: Session, name: str) -> str:
    normalized_name = normalize_discipline_name(name)
    discipline = db.scalar(
        select(CourseDisciplineOption).where(
            func.lower(CourseDisciplineOption.name) == normalized_name.lower(),
        ),
    )
    if discipline is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="La disciplina selezionata non esiste.",
        )
    return discipline.name


def ensure_course_title_available(
    db: Session,
    *,
    location_id: UUID,
    title: str,
    excluding_course_id: UUID | None = None,
) -> None:
    query = select(Course.id).where(
        Course.location_id == location_id,
        func.lower(Course.title) == normalize_course_title(title).lower(),
        Course.status != CourseStatus.ARCHIVED,
    )
    if excluding_course_id is not None:
        query = query.where(Course.id != excluding_course_id)
    if db.scalar(query) is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Esiste gia un corso con questo nome nella sede selezionata.",
        )


def ensure_session_available(
    db: Session,
    *,
    course_id: UUID,
    weekday: int,
    occurs_on: date | None,
    starts_at,
    ends_at,
    excluding_session_id: UUID | None = None,
) -> None:
    query = select(CourseSession.id).where(
        CourseSession.course_id == course_id,
        CourseSession.starts_at == starts_at,
        CourseSession.ends_at == ends_at,
        CourseSession.is_active.is_(True),
    )
    if occurs_on is None:
        query = query.where(
            CourseSession.occurs_on.is_(None),
            CourseSession.weekday == weekday,
        )
    else:
        query = query.where(CourseSession.occurs_on == occurs_on)
    if excluding_session_id is not None:
        query = query.where(CourseSession.id != excluding_session_id)
    if db.scalar(query) is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Questa ricorrenza esiste gia per il corso.",
        )


def commit_course_change(db: Session, *, conflict_detail: str) -> None:
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=conflict_detail) from exc


def delete_course_images(course_id: UUID, settings: Settings) -> None:
    upload_dir = Path(settings.course_upload_dir)
    if not upload_dir.exists():
        return

    for image_path in upload_dir.glob(f"course-{course_id}-*"):
        if image_path.is_file():
            image_path.unlink()


def delete_location_courses(location_id: UUID, db: Session, settings: Settings) -> int:
    courses = list(db.scalars(select(Course).where(Course.location_id == location_id)).all())
    for course in courses:
        delete_course_images(course.id, settings)
        db.delete(course)
    return len(courses)


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


@router.patch("/admin/locations/{location_id}", response_model=LocationCascadeResponse)
def update_location(
    location_id: UUID,
    payload: LocationUpdate,
    _: User = backoffice_user,
    db: Session = Depends(get_db_session),
    settings: Settings = Depends(get_settings),
) -> LocationCascadeResponse:
    location = get_location_or_404(db, location_id)
    data = payload.model_dump(exclude_unset=True)
    deleted_course_count = 0
    if data.get("is_active") is False:
        deleted_course_count = delete_location_courses(location.id, db, settings)
    for field, value in data.items():
        setattr(location, field, value)

    db.add(location)
    db.commit()
    db.refresh(location)
    return LocationCascadeResponse(
        **LocationResponse.model_validate(location).model_dump(),
        deleted_course_count=deleted_course_count,
    )


@router.post(
    "/admin/locations/{location_id}/deactivate",
    response_model=LocationCascadeResponse,
)
def deactivate_location(
    location_id: UUID,
    _: User = backoffice_user,
    db: Session = Depends(get_db_session),
    settings: Settings = Depends(get_settings),
) -> LocationCascadeResponse:
    location = get_location_or_404(db, location_id)
    deleted_course_count = delete_location_courses(location.id, db, settings)
    location.is_active = False
    db.add(location)
    db.commit()
    db.refresh(location)
    return LocationCascadeResponse(
        **LocationResponse.model_validate(location).model_dump(),
        deleted_course_count=deleted_course_count,
    )


@router.delete(
    "/admin/locations/{location_id}",
    response_model=LocationDeleteResponse,
)
def delete_location(
    location_id: UUID,
    _: User = backoffice_user,
    db: Session = Depends(get_db_session),
    settings: Settings = Depends(get_settings),
) -> LocationDeleteResponse:
    location = get_location_or_404(db, location_id)
    deleted_course_count = delete_location_courses(location.id, db, settings)
    db.delete(location)
    db.commit()
    return LocationDeleteResponse(
        id=location_id,
        deleted=True,
        deleted_course_count=deleted_course_count,
    )


@router.get(
    "/admin/disciplines",
    response_model=list[CourseDisciplineResponse],
)
def list_course_disciplines(
    _: User = backoffice_user,
    db: Session = Depends(get_db_session),
) -> list[CourseDisciplineOption]:
    query = select(CourseDisciplineOption).order_by(
        CourseDisciplineOption.sort_order,
        CourseDisciplineOption.name,
    )
    return list(db.scalars(query).all())


@router.post(
    "/admin/disciplines",
    response_model=CourseDisciplineResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_course_discipline(
    payload: CourseDisciplineCreate,
    _: User = admin_user,
    db: Session = Depends(get_db_session),
) -> CourseDisciplineOption:
    name = normalize_discipline_name(payload.name)
    existing = db.scalar(
        select(CourseDisciplineOption).where(
            func.lower(CourseDisciplineOption.name) == name.lower(),
        ),
    )
    if existing is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Questa disciplina esiste gia.",
        )

    highest_sort_order = db.scalar(select(func.max(CourseDisciplineOption.sort_order))) or 0
    discipline = CourseDisciplineOption(
        name=name,
        sort_order=highest_sort_order + 1,
        is_default=False,
    )
    db.add(discipline)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Questa disciplina esiste gia.",
        ) from exc
    db.refresh(discipline)
    return discipline


@router.post("/admin/courses", response_model=CourseResponse, status_code=status.HTTP_201_CREATED)
def create_course(
    payload: CourseCreate,
    _: User = backoffice_user,
    db: Session = Depends(get_db_session),
) -> Course:
    get_active_location_or_422(db, payload.location_id)
    title = normalize_course_title(payload.title)
    ensure_course_title_available(db, location_id=payload.location_id, title=title)
    data = payload.model_dump(exclude={"title"})
    data["discipline"] = registered_discipline_name(db, payload.discipline)
    course = Course(**data, title=title)
    db.add(course)
    commit_course_change(
        db,
        conflict_detail="Esiste gia un corso con questo nome nella sede selezionata.",
    )
    db.refresh(course)
    return course


@router.get("/admin/courses", response_model=list[CourseResponse])
def list_admin_courses(
    _: User = backoffice_user,
    db: Session = Depends(get_db_session),
) -> list[Course]:
    query = select(Course).options(selectinload(Course.sessions)).order_by(Course.title)
    return list(db.scalars(query).unique().all())


@router.patch("/admin/courses/{course_id}", response_model=CourseResponse)
def update_course(
    course_id: UUID,
    payload: CourseUpdate,
    _: User = backoffice_user,
    db: Session = Depends(get_db_session),
) -> Course:
    course = get_course_or_404(db, course_id)
    data = payload.model_dump(exclude_unset=True)
    location_id = data.get("location_id", course.location_id)
    title = normalize_course_title(data.get("title", course.title))
    if "location_id" in data:
        get_active_location_or_422(db, location_id)
    if "discipline" in data:
        data["discipline"] = registered_discipline_name(db, data["discipline"])
    ensure_course_title_available(
        db,
        location_id=location_id,
        title=title,
        excluding_course_id=course.id,
    )
    data["title"] = title

    for field, value in data.items():
        setattr(course, field, value)

    db.add(course)
    commit_course_change(
        db,
        conflict_detail="Esiste gia un corso con questo nome nella sede selezionata.",
    )
    db.refresh(course)
    return course


@router.post("/admin/courses/{course_id}/archive", response_model=CourseResponse)
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


@router.delete("/admin/courses/{course_id}", response_model=CourseDeleteResponse)
def delete_course(
    course_id: UUID,
    _: User = backoffice_user,
    db: Session = Depends(get_db_session),
    settings: Settings = Depends(get_settings),
) -> CourseDeleteResponse:
    course = get_course_or_404(db, course_id)
    delete_course_images(course.id, settings)
    db.delete(course)
    db.commit()
    return CourseDeleteResponse(id=course_id, deleted=True)


@router.post("/admin/courses/{course_id}/image", response_model=CourseResponse)
async def upload_course_image(
    course_id: UUID,
    file: UploadFile = File(...),
    _: User = backoffice_user,
    db: Session = Depends(get_db_session),
    settings: Settings = Depends(get_settings),
) -> Course:
    course = get_course_or_404(db, course_id)
    extension = allowed_course_image_types.get(file.content_type or "")
    if extension is None:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail="Formato immagine non supportato. Usa JPG, PNG o WebP.",
        )

    content = await file.read(max_course_image_bytes + 1)
    if len(content) > max_course_image_bytes:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="L'immagine supera il limite di 5 MB.",
        )

    upload_dir = Path(settings.course_upload_dir)
    upload_dir.mkdir(parents=True, exist_ok=True)
    filename = f"course-{course.id}-{uuid4().hex}{extension}"
    target = upload_dir / filename
    target.write_bytes(content)

    course.image_url = f"/uploads/{filename}"
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
    occurs_on = payload.occurs_on
    weekday = payload.weekday if occurs_on is None else sunday_based_weekday(occurs_on)
    if weekday is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="A weekday or occurrence date is required",
        )
    ensure_session_available(
        db,
        course_id=course_id,
        weekday=weekday,
        occurs_on=occurs_on,
        starts_at=payload.starts_at,
        ends_at=payload.ends_at,
    )
    course_session = CourseSession(
        course_id=course_id,
        weekday=weekday,
        occurs_on=occurs_on,
        starts_at=payload.starts_at,
        ends_at=payload.ends_at,
        capacity=payload.capacity,
        cancellation_deadline_hours=payload.cancellation_deadline_hours,
    )
    db.add(course_session)
    commit_course_change(db, conflict_detail="Questa ricorrenza esiste gia per il corso.")
    db.refresh(course_session)
    return course_session


@router.post(
    "/admin/courses/{course_id}/schedule",
    response_model=list[CourseSessionResponse],
    status_code=status.HTTP_201_CREATED,
)
def create_course_schedule(
    course_id: UUID,
    payload: CourseScheduleCreate,
    _: User = backoffice_user,
    db: Session = Depends(get_db_session),
) -> list[CourseSession]:
    get_course_or_404(db, course_id)
    ensure_time_order(payload.starts_at, payload.ends_at)
    if len(set(payload.weekdays)) != len(payload.weekdays):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Seleziona ogni giorno una sola volta.",
        )

    sessions: list[CourseSession] = []
    for weekday in sorted(payload.weekdays):
        ensure_session_available(
            db,
            course_id=course_id,
            weekday=weekday,
            occurs_on=None,
            starts_at=payload.starts_at,
            ends_at=payload.ends_at,
        )
        sessions.append(
            CourseSession(
                course_id=course_id,
                weekday=weekday,
                starts_at=payload.starts_at,
                ends_at=payload.ends_at,
                capacity=payload.capacity,
                cancellation_deadline_hours=payload.cancellation_deadline_hours,
            ),
        )

    db.add_all(sessions)
    commit_course_change(db, conflict_detail="Una delle ricorrenze esiste gia per il corso.")
    for course_session in sessions:
        db.refresh(course_session)
    return sessions


@router.post(
    "/admin/courses/{course_id}/schedule/batch",
    response_model=list[CourseSessionResponse],
    status_code=status.HTTP_201_CREATED,
)
def create_course_schedule_batch(
    course_id: UUID,
    payload: CourseScheduleBatchCreate,
    _: User = backoffice_user,
    db: Session = Depends(get_db_session),
) -> list[CourseSession]:
    get_course_or_404(db, course_id)
    if len(set(payload.weekdays)) != len(payload.weekdays):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Seleziona ogni giorno una sola volta.",
        )

    slot_keys = [(slot.starts_at, slot.ends_at) for slot in payload.slots]
    if len(set(slot_keys)) != len(slot_keys):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Ogni fascia oraria deve essere inserita una sola volta.",
        )

    sessions: list[CourseSession] = []
    for slot in payload.slots:
        ensure_time_order(slot.starts_at, slot.ends_at)
        for weekday in sorted(payload.weekdays):
            ensure_session_available(
                db,
                course_id=course_id,
                weekday=weekday,
                occurs_on=None,
                starts_at=slot.starts_at,
                ends_at=slot.ends_at,
            )
            sessions.append(
                CourseSession(
                    course_id=course_id,
                    weekday=weekday,
                    starts_at=slot.starts_at,
                    ends_at=slot.ends_at,
                    capacity=slot.capacity,
                    cancellation_deadline_hours=slot.cancellation_deadline_hours,
                ),
            )

    db.add_all(sessions)
    commit_course_change(db, conflict_detail="Una delle ricorrenze esiste gia per il corso.")
    for course_session in sessions:
        db.refresh(course_session)
    return sessions


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
    weekday = data.get("weekday", course_session.weekday)
    occurs_on = data.get("occurs_on", course_session.occurs_on)
    if occurs_on is not None:
        weekday = sunday_based_weekday(occurs_on)
        data["weekday"] = weekday
    elif "occurs_on" in data and course_session.occurs_on is not None and "weekday" not in data:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="A weekday is required when converting to a recurring session",
        )
    ensure_time_order(starts_at, ends_at)
    ensure_session_available(
        db,
        course_id=course_session.course_id,
        weekday=weekday,
        occurs_on=occurs_on,
        starts_at=starts_at,
        ends_at=ends_at,
        excluding_session_id=course_session.id,
    )
    if "capacity" in data:
        confirmed_count = max_confirmed_booking_count(db, course_session.id)
        if data["capacity"] < confirmed_count:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=(
                    f"La capienza non puo scendere sotto {confirmed_count} prenotazioni confermate."
                ),
            )

    for field, value in data.items():
        setattr(course_session, field, value)

    db.add(course_session)
    commit_course_change(db, conflict_detail="Questa ricorrenza esiste gia per il corso.")
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


@router.get("/courses", response_model=list[CatalogCourseResponse])
def list_catalog_courses(
    location_id: UUID | None = None,
    weekday: int | None = Query(default=None, ge=0, le=6),
    available: bool | None = None,
    on_date: date | None = Query(default=None, alias="occurs_on"),
    db: Session = Depends(get_db_session),
    settings: Settings = Depends(get_settings),
) -> list[CatalogCourseResponse]:
    query = (
        select(Course)
        .join(Course.location)
        .where(Course.status == CourseStatus.PUBLISHED, Location.is_active.is_(True))
        .order_by(Course.title)
    )
    if location_id is not None:
        query = query.where(Course.location_id == location_id)

    today = local_today(settings.app_timezone)
    horizon = today + timedelta(days=settings.booking_horizon_days)
    if on_date is not None and not today <= on_date <= horizon:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Occurrence date is outside the booking window",
        )
    starts_on = on_date or today
    ends_on = on_date or horizon
    catalog_courses: list[CatalogCourseResponse] = []
    for course in db.scalars(query).unique().all():
        catalog_sessions: list[CatalogSessionResponse] = []
        for course_session in course.sessions:
            if not course_session.is_active:
                continue
            if weekday is not None and course_session.weekday != weekday:
                continue

            if course_session.occurs_on is None:
                course_occurrences = occurrence_dates(
                    course_session.weekday,
                    starts_on=starts_on,
                    ends_on=ends_on,
                )
            elif starts_on <= course_session.occurs_on <= ends_on:
                course_occurrences = [course_session.occurs_on]
            else:
                course_occurrences = []

            for occurs_on in course_occurrences:
                if occurrence_start_at(
                    occurs_on,
                    course_session.starts_at,
                    settings.app_timezone,
                ) <= datetime.now(UTC):
                    continue
                booked_spots = confirmed_booking_count(db, course_session.id, occurs_on)
                available_spots = max(course_session.capacity - booked_spots, 0)
                if available is True and available_spots <= 0:
                    continue
                if available is False and available_spots > 0:
                    continue

                catalog_sessions.append(
                    CatalogSessionResponse(
                        id=course_session.id,
                        occurs_on=occurs_on,
                        weekday=course_session.weekday,
                        starts_at=course_session.starts_at,
                        ends_at=course_session.ends_at,
                        capacity=course_session.capacity,
                        available_spots=available_spots,
                    ),
                )

        catalog_sessions.sort(key=lambda item: (item.occurs_on, item.starts_at))

        if catalog_sessions:
            catalog_courses.append(
                CatalogCourseResponse(
                    id=course.id,
                    location_id=course.location_id,
                    location_name=course.location.name,
                    title=course.title,
                    description=course.description,
                    discipline=course.discipline,
                    image_url=course.image_url,
                    requires_active_subscription=course.requires_active_subscription,
                    sessions=catalog_sessions,
                ),
            )

    return catalog_courses
