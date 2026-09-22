from datetime import date, datetime
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from chiron_api.db.models import WorkoutPlanStatus


class WorkoutExercisePayload(BaseModel):
    id: UUID | None = None
    name: str = Field(min_length=1, max_length=180)
    sets_planned: int = Field(gt=0, le=50)
    reps_planned: str = Field(min_length=1, max_length=40)
    rest_seconds: int | None = Field(default=None, ge=0, le=3600)
    notes: str | None = Field(default=None, max_length=500)
    position: int = Field(default=0, ge=0, le=1000)


class WorkoutDayPayload(BaseModel):
    id: UUID | None = None
    label: str = Field(min_length=1, max_length=80)
    title: str | None = Field(default=None, max_length=180)
    position: int = Field(default=0, ge=0, le=1000)
    exercises: list[WorkoutExercisePayload] = Field(default_factory=list, max_length=100)


class WorkoutPlanCreate(BaseModel):
    title: str = Field(min_length=1, max_length=180)
    description: str | None = Field(default=None, max_length=4000)
    status: WorkoutPlanStatus = WorkoutPlanStatus.DRAFT
    days: list[WorkoutDayPayload] = Field(default_factory=list, max_length=30)


class WorkoutPlanUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=180)
    description: str | None = Field(default=None, max_length=4000)
    status: WorkoutPlanStatus | None = None
    days: list[WorkoutDayPayload] | None = Field(default=None, max_length=30)


class WorkoutExerciseResponse(BaseModel):
    id: UUID
    name: str
    sets_planned: int
    reps_planned: str
    rest_seconds: int | None
    notes: str | None
    position: int

    model_config = ConfigDict(from_attributes=True)


class WorkoutDayResponse(BaseModel):
    id: UUID
    label: str
    title: str | None
    position: int
    exercises: list[WorkoutExerciseResponse]

    model_config = ConfigDict(from_attributes=True)


class WorkoutPlanResponse(BaseModel):
    id: UUID
    title: str
    description: str | None
    status: WorkoutPlanStatus
    created_by_id: UUID | None
    created_at: datetime
    updated_at: datetime
    days: list[WorkoutDayResponse]
    latest_results: list["WorkoutLatestResultResponse"] = Field(default_factory=list)

    model_config = ConfigDict(from_attributes=True)


class WorkoutPlanSummaryResponse(BaseModel):
    id: UUID
    title: str
    description: str | None
    status: WorkoutPlanStatus
    created_at: datetime
    updated_at: datetime
    day_count: int


class WorkoutPlanAssignmentCreate(BaseModel):
    user_id: UUID


class WorkoutPlanAssignmentResponse(BaseModel):
    user_id: UUID
    user_email: str
    first_name: str | None
    last_name: str | None
    assigned_at: datetime


class WorkoutLatestResultResponse(BaseModel):
    exercise_id: UUID
    repetitions: int
    load_kg: Decimal
    workout_date: date


class WorkoutLogEntryPayload(BaseModel):
    exercise_id: UUID | None = None
    exercise_name_snapshot: str = Field(min_length=1, max_length=180)
    set_number: int = Field(gt=0, le=50)
    repetitions: int = Field(gt=0, le=1000)
    load_kg: Decimal = Field(ge=0, le=1000, max_digits=7, decimal_places=2)
    note: str | None = Field(default=None, max_length=500)


class WorkoutLogCreate(BaseModel):
    plan_id: UUID = Field()
    day_id: UUID = Field()
    workout_date: date
    general_note: str | None = Field(default=None, max_length=2000)
    rating: int | None = Field(default=None, ge=1, le=5)
    entries: list[WorkoutLogEntryPayload] = Field(min_length=1, max_length=500)


class WorkoutLogResponseEntry(BaseModel):
    id: UUID
    exercise_id: UUID | None
    exercise_name_snapshot: str
    set_number: int
    repetitions: int
    load_kg: Decimal
    note: str | None

    model_config = ConfigDict(from_attributes=True)


class WorkoutLogResponse(BaseModel):
    id: UUID
    user_id: UUID
    plan_id: UUID | None
    day_id: UUID | None
    workout_date: date
    general_note: str | None
    rating: int | None
    created_at: datetime
    updated_at: datetime
    entries: list[WorkoutLogResponseEntry]

    model_config = ConfigDict(from_attributes=True)
