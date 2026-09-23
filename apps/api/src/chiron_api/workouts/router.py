from decimal import Decimal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import delete, select, update
from sqlalchemy.orm import Session, selectinload

from chiron_api.auth.dependencies import get_current_user, require_roles
from chiron_api.db.models import (
    User,
    UserRole,
    WorkoutDay,
    WorkoutExercise,
    WorkoutLog,
    WorkoutLogEntry,
    WorkoutPlan,
    WorkoutPlanAssignment,
    WorkoutPlanStatus,
)
from chiron_api.db.session import get_db_session
from chiron_api.workouts.schemas import (
    WorkoutDayResponse,
    WorkoutExerciseResponse,
    WorkoutLatestResultResponse,
    WorkoutLogCreate,
    WorkoutLogResponse,
    WorkoutPlanAssignmentCreate,
    WorkoutPlanAssignmentResponse,
    WorkoutPlanCreate,
    WorkoutPlanResponse,
    WorkoutPlanSummaryResponse,
    WorkoutPlanUpdate,
)

router = APIRouter(tags=["workouts"])
backoffice_user = Depends(require_roles(UserRole.ADMIN, UserRole.STAFF))
admin_user = Depends(require_roles(UserRole.ADMIN))


def normalize_text(value: str) -> str:
    return " ".join(value.strip().split())


def load_plan_query(plan_id: UUID):
    return (
        select(WorkoutPlan)
        .where(WorkoutPlan.id == plan_id)
        .options(selectinload(WorkoutPlan.days).selectinload(WorkoutDay.exercises))
    )


def get_plan(db: Session, plan_id: UUID) -> WorkoutPlan:
    plan = db.scalar(load_plan_query(plan_id))
    if plan is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Scheda non trovata")
    return plan


def plan_response(
    plan: WorkoutPlan,
    latest_results: list[WorkoutLatestResultResponse] | None = None,
) -> WorkoutPlanResponse:
    active_days = [day for day in plan.days if not day.is_archived]
    return WorkoutPlanResponse(
        id=plan.id,
        title=plan.title,
        description=plan.description,
        status=plan.status,
        created_by_id=plan.created_by_id,
        created_at=plan.created_at,
        updated_at=plan.updated_at,
        days=[
            WorkoutDayResponse(
                id=day.id,
                label=day.label,
                title=day.title,
                position=day.position,
                exercises=[
                    WorkoutExerciseResponse(
                        id=exercise.id,
                        name=exercise.name,
                        sets_planned=exercise.sets_planned,
                        reps_planned=exercise.reps_planned,
                        rest_seconds=exercise.rest_seconds,
                        notes=exercise.notes,
                        position=exercise.position,
                    )
                    for exercise in day.exercises
                    if not exercise.is_archived
                ],
            )
            for day in active_days
        ],
        latest_results=latest_results or [],
    )


def latest_results_for_user(
    db: Session,
    user_id: UUID,
    plan_id: UUID,
) -> list[WorkoutLatestResultResponse]:
    rows = db.execute(
        select(WorkoutLogEntry, WorkoutLog.workout_date)
        .join(WorkoutLog, WorkoutLog.id == WorkoutLogEntry.log_id)
        .where(WorkoutLog.user_id == user_id, WorkoutLog.plan_id == plan_id)
        .order_by(
            WorkoutLog.workout_date.desc(), WorkoutLog.created_at.desc(), WorkoutLogEntry.id.desc()
        ),
    ).all()
    seen: set[UUID] = set()
    results: list[WorkoutLatestResultResponse] = []
    for entry, workout_date in rows:
        if entry.exercise_id is None or entry.exercise_id in seen:
            continue
        seen.add(entry.exercise_id)
        results.append(
            WorkoutLatestResultResponse(
                exercise_id=entry.exercise_id,
                repetitions=entry.repetitions,
                load_kg=Decimal(entry.load_kg),
                workout_date=workout_date,
            ),
        )
    return results


def apply_plan_days(db: Session, plan: WorkoutPlan, payload_days) -> None:
    existing_days = {day.id: day for day in plan.days}
    supplied_day_ids: set[UUID] = set()

    for day_position, day_payload in enumerate(payload_days):
        label = normalize_text(day_payload.label)
        if day_payload.id is not None:
            day = existing_days.get(day_payload.id)
            if day is None:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail="Giorno non valido"
                )
            supplied_day_ids.add(day.id)
            day.label = label
            day.title = normalize_text(day_payload.title) if day_payload.title else None
            day.position = day_position
            day.is_archived = False
        else:
            day = WorkoutDay(
                plan=plan,
                label=label,
                title=normalize_text(day_payload.title) if day_payload.title else None,
                position=day_position,
            )
            db.add(day)
            db.flush()
            supplied_day_ids.add(day.id)

        existing_exercises = {exercise.id: exercise for exercise in day.exercises}
        supplied_exercise_ids: set[UUID] = set()
        for exercise_position, exercise_payload in enumerate(day_payload.exercises):
            name = normalize_text(exercise_payload.name)
            if exercise_payload.id is not None:
                exercise = existing_exercises.get(exercise_payload.id)
                if exercise is None:
                    raise HTTPException(
                        status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                        detail="Esercizio non valido per il giorno selezionato",
                    )
                supplied_exercise_ids.add(exercise.id)
                exercise.name = name
                exercise.sets_planned = exercise_payload.sets_planned
                exercise.reps_planned = normalize_text(exercise_payload.reps_planned)
                exercise.rest_seconds = exercise_payload.rest_seconds
                exercise.notes = (
                    normalize_text(exercise_payload.notes) if exercise_payload.notes else None
                )
                exercise.position = exercise_position
                exercise.is_archived = False
            else:
                exercise = WorkoutExercise(
                    day=day,
                    name=name,
                    sets_planned=exercise_payload.sets_planned,
                    reps_planned=normalize_text(exercise_payload.reps_planned),
                    rest_seconds=exercise_payload.rest_seconds,
                    notes=normalize_text(exercise_payload.notes)
                    if exercise_payload.notes
                    else None,
                    position=exercise_position,
                )
                db.add(exercise)
                db.flush()
                supplied_exercise_ids.add(exercise.id)
        for exercise in day.exercises:
            if exercise.id not in supplied_exercise_ids:
                exercise.is_archived = True

    for day in plan.days:
        if day.id not in supplied_day_ids and day.id is not None:
            day.is_archived = True


def ensure_plan_day_and_exercises(
    db: Session,
    payload: WorkoutLogCreate,
    user_id: UUID,
    *,
    allow_archived: bool,
) -> tuple[WorkoutPlan, WorkoutDay, dict[UUID, WorkoutExercise]]:
    plan = db.scalar(
        select(WorkoutPlan)
        .where(WorkoutPlan.id == payload.plan_id)
        .options(selectinload(WorkoutPlan.days).selectinload(WorkoutDay.exercises)),
    )
    is_assigned = db.scalar(
        select(WorkoutPlanAssignment.id).where(
            WorkoutPlanAssignment.plan_id == payload.plan_id,
            WorkoutPlanAssignment.user_id == user_id,
        )
    ) is not None
    if (
        plan is None
        or not is_assigned
        or (not allow_archived and plan.status != WorkoutPlanStatus.PUBLISHED)
    ):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Scheda non disponibile")
    day = next((item for item in plan.days if item.id == payload.day_id), None)
    if day is None or (not allow_archived and day.is_archived):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail="Giorno non valido"
        )
    exercises = {exercise.id: exercise for exercise in day.exercises}
    for entry in payload.entries:
        exercise = exercises.get(entry.exercise_id) if entry.exercise_id is not None else None
        if exercise is None or (not allow_archived and exercise.is_archived):
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail="Uno degli esercizi non appartiene al giorno selezionato",
            )
    return plan, day, exercises


def replace_log_entries(
    db: Session,
    log: WorkoutLog,
    payload: WorkoutLogCreate,
    exercises: dict[UUID, WorkoutExercise],
) -> None:
    log.entries.clear()
    for entry_payload in payload.entries:
        exercise = exercises[entry_payload.exercise_id]  # validated by caller
        log.entries.append(
            WorkoutLogEntry(
                exercise_id=exercise.id,
                exercise_name_snapshot=exercise.name,
                set_number=entry_payload.set_number,
                repetitions=entry_payload.repetitions,
                load_kg=entry_payload.load_kg,
                note=normalize_text(entry_payload.note) if entry_payload.note else None,
            ),
        )


@router.get("/workouts/plans", response_model=list[WorkoutPlanResponse])
def list_published_plans(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db_session),
) -> list[WorkoutPlanResponse]:
    plans = (
        db.scalars(
            select(WorkoutPlan)
            .join(WorkoutPlanAssignment, WorkoutPlanAssignment.plan_id == WorkoutPlan.id)
            .where(
                WorkoutPlan.status == WorkoutPlanStatus.PUBLISHED,
                WorkoutPlanAssignment.user_id == current_user.id,
            )
            .options(selectinload(WorkoutPlan.days).selectinload(WorkoutDay.exercises))
            .order_by(WorkoutPlan.updated_at.desc()),
        )
        .unique()
        .all()
    )
    return [
        plan_response(plan, latest_results_for_user(db, current_user.id, plan.id)) for plan in plans
    ]


@router.get("/workouts/logs", response_model=list[WorkoutLogResponse])
def list_workout_logs(
    limit: int = Query(default=20, ge=1, le=50),
    offset: int = Query(default=0, ge=0),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db_session),
) -> list[WorkoutLogResponse]:
    logs = (
        db.scalars(
            select(WorkoutLog)
            .where(WorkoutLog.user_id == current_user.id)
            .options(selectinload(WorkoutLog.entries))
            .order_by(WorkoutLog.workout_date.desc(), WorkoutLog.created_at.desc())
            .offset(offset)
            .limit(limit),
        )
        .unique()
        .all()
    )
    return [WorkoutLogResponse.model_validate(log) for log in logs]


@router.post(
    "/workouts/logs", response_model=WorkoutLogResponse, status_code=status.HTTP_201_CREATED
)
def create_workout_log(
    payload: WorkoutLogCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db_session),
) -> WorkoutLog:
    plan, day, exercises = ensure_plan_day_and_exercises(
        db, payload, current_user.id, allow_archived=False
    )
    log = WorkoutLog(
        user_id=current_user.id,
        plan_id=plan.id,
        day_id=day.id,
        workout_date=payload.workout_date,
        general_note=normalize_text(payload.general_note) if payload.general_note else None,
        rating=payload.rating,
    )
    db.add(log)
    replace_log_entries(db, log, payload, exercises)
    db.commit()
    db.refresh(log)
    return log


@router.get("/workouts/logs/{log_id}", response_model=WorkoutLogResponse)
def get_workout_log(
    log_id: UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db_session),
) -> WorkoutLog:
    log = db.scalar(
        select(WorkoutLog)
        .where(WorkoutLog.id == log_id, WorkoutLog.user_id == current_user.id)
        .options(selectinload(WorkoutLog.entries)),
    )
    if log is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Allenamento non trovato")
    return log


@router.put("/workouts/logs/{log_id}", response_model=WorkoutLogResponse)
def update_workout_log(
    log_id: UUID,
    payload: WorkoutLogCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db_session),
) -> WorkoutLog:
    log = db.scalar(
        select(WorkoutLog)
        .where(WorkoutLog.id == log_id, WorkoutLog.user_id == current_user.id)
        .options(selectinload(WorkoutLog.entries)),
    )
    if log is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Allenamento non trovato")
    _, day, exercises = ensure_plan_day_and_exercises(
        db, payload, current_user.id, allow_archived=True
    )
    log.plan_id = payload.plan_id
    log.day_id = day.id
    log.workout_date = payload.workout_date
    log.general_note = normalize_text(payload.general_note) if payload.general_note else None
    log.rating = payload.rating
    replace_log_entries(db, log, payload, exercises)
    db.commit()
    db.refresh(log)
    return log


@router.delete("/workouts/logs/{log_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_workout_log(
    log_id: UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db_session),
) -> None:
    log = db.scalar(
        select(WorkoutLog).where(WorkoutLog.id == log_id, WorkoutLog.user_id == current_user.id)
    )
    if log is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Allenamento non trovato")
    db.delete(log)
    db.commit()


@router.get("/admin/workout-plans", response_model=list[WorkoutPlanSummaryResponse])
def list_admin_plans(
    _: User = backoffice_user,
    db: Session = Depends(get_db_session),
) -> list[WorkoutPlanSummaryResponse]:
    plans = (
        db.scalars(
            select(WorkoutPlan)
            .options(selectinload(WorkoutPlan.days))
            .order_by(WorkoutPlan.updated_at.desc()),
        )
        .unique()
        .all()
    )
    return [
        WorkoutPlanSummaryResponse(
            id=plan.id,
            title=plan.title,
            description=plan.description,
            status=plan.status,
            created_at=plan.created_at,
            updated_at=plan.updated_at,
            day_count=sum(not day.is_archived for day in plan.days),
        )
        for plan in plans
    ]


@router.get("/admin/workout-plans/{plan_id}", response_model=WorkoutPlanResponse)
def get_admin_plan(
    plan_id: UUID,
    _: User = backoffice_user,
    db: Session = Depends(get_db_session),
) -> WorkoutPlanResponse:
    return plan_response(get_plan(db, plan_id))


def assignment_response(assignment: WorkoutPlanAssignment) -> WorkoutPlanAssignmentResponse:
    profile = assignment.user.profile
    return WorkoutPlanAssignmentResponse(
        user_id=assignment.user_id,
        user_email=assignment.user.email,
        first_name=profile.first_name if profile is not None else None,
        last_name=profile.last_name if profile is not None else None,
        assigned_at=assignment.assigned_at,
    )


@router.get(
    "/admin/workout-plans/{plan_id}/assignments",
    response_model=list[WorkoutPlanAssignmentResponse],
)
def list_admin_plan_assignments(
    plan_id: UUID,
    _: User = admin_user,
    db: Session = Depends(get_db_session),
) -> list[WorkoutPlanAssignmentResponse]:
    get_plan(db, plan_id)
    assignments = db.scalars(
        select(WorkoutPlanAssignment)
        .where(WorkoutPlanAssignment.plan_id == plan_id)
        .options(selectinload(WorkoutPlanAssignment.user).selectinload(User.profile))
        .order_by(WorkoutPlanAssignment.assigned_at.asc())
    ).all()
    return [assignment_response(assignment) for assignment in assignments]


@router.post(
    "/admin/workout-plans/{plan_id}/assignments",
    response_model=WorkoutPlanAssignmentResponse,
    status_code=status.HTTP_201_CREATED,
)
def assign_admin_plan(
    plan_id: UUID,
    payload: WorkoutPlanAssignmentCreate,
    _: User = admin_user,
    db: Session = Depends(get_db_session),
) -> WorkoutPlanAssignmentResponse:
    get_plan(db, plan_id)
    user = db.scalar(
        select(User).where(
            User.id == payload.user_id,
            User.role == UserRole.USER,
            User.status == "active",
        ).options(selectinload(User.profile))
    )
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Utente non trovato")
    assignment = db.scalar(
        select(WorkoutPlanAssignment)
        .where(
            WorkoutPlanAssignment.plan_id == plan_id,
            WorkoutPlanAssignment.user_id == payload.user_id,
        )
        .options(selectinload(WorkoutPlanAssignment.user).selectinload(User.profile))
    )
    if assignment is not None:
        return assignment_response(assignment)
    assignment = WorkoutPlanAssignment(plan_id=plan_id, user_id=user.id, user=user)
    db.add(assignment)
    db.commit()
    db.refresh(assignment)
    return assignment_response(assignment)


@router.delete(
    "/admin/workout-plans/{plan_id}/assignments/{user_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def unassign_admin_plan(
    plan_id: UUID,
    user_id: UUID,
    _: User = admin_user,
    db: Session = Depends(get_db_session),
) -> None:
    assignment = db.scalar(
        select(WorkoutPlanAssignment).where(
            WorkoutPlanAssignment.plan_id == plan_id,
            WorkoutPlanAssignment.user_id == user_id,
        )
    )
    if assignment is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Assegnazione non trovata"
        )
    db.delete(assignment)
    db.commit()


@router.post(
    "/admin/workout-plans", response_model=WorkoutPlanResponse, status_code=status.HTTP_201_CREATED
)
def create_admin_plan(
    payload: WorkoutPlanCreate,
    current_user: User = backoffice_user,
    db: Session = Depends(get_db_session),
) -> WorkoutPlanResponse:
    plan = WorkoutPlan(
        title=normalize_text(payload.title),
        description=normalize_text(payload.description) if payload.description else None,
        status=payload.status,
        created_by_id=current_user.id,
    )
    db.add(plan)
    db.flush()
    apply_plan_days(db, plan, payload.days)
    db.commit()
    return plan_response(get_plan(db, plan.id))


@router.patch("/admin/workout-plans/{plan_id}", response_model=WorkoutPlanResponse)
def update_admin_plan(
    plan_id: UUID,
    payload: WorkoutPlanUpdate,
    _: User = backoffice_user,
    db: Session = Depends(get_db_session),
) -> WorkoutPlanResponse:
    plan = get_plan(db, plan_id)
    if plan.status == WorkoutPlanStatus.ARCHIVED:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="La scheda è archiviata")
    if payload.title is not None:
        plan.title = normalize_text(payload.title)
    if payload.description is not None:
        plan.description = normalize_text(payload.description) or None
    if payload.status is not None:
        plan.status = payload.status
    if payload.days is not None:
        apply_plan_days(db, plan, payload.days)
    db.commit()
    return plan_response(get_plan(db, plan.id))


@router.post(
    "/admin/workout-plans/{plan_id}/duplicate",
    response_model=WorkoutPlanResponse,
    status_code=status.HTTP_201_CREATED,
)
def duplicate_admin_plan(
    plan_id: UUID,
    current_user: User = backoffice_user,
    db: Session = Depends(get_db_session),
) -> WorkoutPlanResponse:
    source = get_plan(db, plan_id)
    duplicate = WorkoutPlan(
        title=f"{source.title} (copia)",
        description=source.description,
        status=WorkoutPlanStatus.DRAFT,
        created_by_id=current_user.id,
    )
    for day in source.days:
        if day.is_archived:
            continue
        new_day = WorkoutDay(label=day.label, title=day.title, position=day.position)
        duplicate.days.append(new_day)
        for exercise in day.exercises:
            if exercise.is_archived:
                continue
            new_day.exercises.append(
                WorkoutExercise(
                    name=exercise.name,
                    sets_planned=exercise.sets_planned,
                    reps_planned=exercise.reps_planned,
                    rest_seconds=exercise.rest_seconds,
                    notes=exercise.notes,
                    position=exercise.position,
                ),
            )
    db.add(duplicate)
    db.commit()
    return plan_response(get_plan(db, duplicate.id))


@router.post("/admin/workout-plans/{plan_id}/publish", response_model=WorkoutPlanResponse)
def publish_admin_plan(
    plan_id: UUID,
    _: User = backoffice_user,
    db: Session = Depends(get_db_session),
) -> WorkoutPlanResponse:
    plan = get_plan(db, plan_id)
    if not any(
        not day.is_archived and any(not exercise.is_archived for exercise in day.exercises)
        for day in plan.days
    ):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="Aggiungi almeno un esercizio prima di pubblicare",
        )
    plan.status = WorkoutPlanStatus.PUBLISHED
    db.commit()
    return plan_response(get_plan(db, plan.id))


@router.post("/admin/workout-plans/{plan_id}/unpublish", response_model=WorkoutPlanResponse)
def unpublish_admin_plan(
    plan_id: UUID,
    _: User = backoffice_user,
    db: Session = Depends(get_db_session),
) -> WorkoutPlanResponse:
    plan = get_plan(db, plan_id)
    plan.status = WorkoutPlanStatus.DRAFT
    db.commit()
    return plan_response(get_plan(db, plan.id))


@router.post("/admin/workout-plans/{plan_id}/archive", response_model=WorkoutPlanResponse)
def archive_admin_plan(
    plan_id: UUID,
    _: User = backoffice_user,
    db: Session = Depends(get_db_session),
) -> WorkoutPlanResponse:
    plan = get_plan(db, plan_id)
    plan.status = WorkoutPlanStatus.ARCHIVED
    for day in plan.days:
        day.is_archived = True
        for exercise in day.exercises:
            exercise.is_archived = True
    db.commit()
    return plan_response(get_plan(db, plan.id))


@router.delete("/admin/workout-plans/{plan_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_admin_plan(
    plan_id: UUID,
    _: User = admin_user,
    db: Session = Depends(get_db_session),
) -> None:
    plan = get_plan(db, plan_id)
    day_ids = [day.id for day in plan.days]
    exercise_ids = [exercise.id for day in plan.days for exercise in day.exercises]

    # Preserve completed training history, but detach it from the deleted programme.
    if exercise_ids:
        db.execute(
            update(WorkoutLogEntry)
            .where(WorkoutLogEntry.exercise_id.in_(exercise_ids))
            .values(exercise_id=None)
        )
    if day_ids:
        db.execute(update(WorkoutLog).where(WorkoutLog.day_id.in_(day_ids)).values(day_id=None))
    db.execute(update(WorkoutLog).where(WorkoutLog.plan_id == plan.id).values(plan_id=None))
    db.execute(delete(WorkoutPlanAssignment).where(WorkoutPlanAssignment.plan_id == plan.id))

    db.delete(plan)
    db.commit()
