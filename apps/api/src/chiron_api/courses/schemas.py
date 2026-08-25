from __future__ import annotations

from datetime import time
from typing import Annotated
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from chiron_api.db.models import CourseDiscipline, CourseStatus


class LocationCreate(BaseModel):
    name: str = Field(min_length=1, max_length=180)
    address: str = Field(min_length=1, max_length=255)
    city: str = Field(min_length=1, max_length=120)


class LocationUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=180)
    address: str | None = Field(default=None, min_length=1, max_length=255)
    city: str | None = Field(default=None, min_length=1, max_length=120)
    is_active: bool | None = None


class LocationResponse(BaseModel):
    id: UUID
    name: str
    address: str
    city: str
    is_active: bool

    model_config = ConfigDict(from_attributes=True)


class CourseCreate(BaseModel):
    location_id: UUID
    title: str = Field(min_length=1, max_length=180)
    description: str | None = None
    discipline: CourseDiscipline = CourseDiscipline.OTHER
    instructor_user_id: UUID | None = None
    status: CourseStatus = CourseStatus.DRAFT


class CourseUpdate(BaseModel):
    location_id: UUID | None = None
    title: str | None = Field(default=None, min_length=1, max_length=180)
    description: str | None = None
    discipline: CourseDiscipline | None = None
    instructor_user_id: UUID | None = None
    status: CourseStatus | None = None


class CourseResponse(BaseModel):
    id: UUID
    location_id: UUID
    instructor_user_id: UUID | None
    title: str
    description: str | None
    discipline: CourseDiscipline
    image_url: str | None
    status: CourseStatus
    sessions: list[CourseSessionResponse] = Field(default_factory=list)

    model_config = ConfigDict(from_attributes=True)


class CourseSessionCreate(BaseModel):
    weekday: int = Field(ge=0, le=6)
    starts_at: time
    ends_at: time
    capacity: int = Field(gt=0)
    cancellation_deadline_hours: int = Field(default=24, ge=0)


class CourseScheduleCreate(BaseModel):
    weekdays: list[Annotated[int, Field(ge=0, le=6)]] = Field(min_length=1, max_length=7)
    starts_at: time
    ends_at: time
    capacity: int = Field(gt=0)
    cancellation_deadline_hours: int = Field(default=24, ge=0)


class CourseSessionUpdate(BaseModel):
    weekday: int | None = Field(default=None, ge=0, le=6)
    starts_at: time | None = None
    ends_at: time | None = None
    capacity: int | None = Field(default=None, gt=0)
    cancellation_deadline_hours: int | None = Field(default=None, ge=0)
    is_active: bool | None = None


class CourseSessionResponse(BaseModel):
    id: UUID
    course_id: UUID
    weekday: int
    starts_at: time
    ends_at: time
    capacity: int
    cancellation_deadline_hours: int
    is_active: bool

    model_config = ConfigDict(from_attributes=True)


class CatalogSessionResponse(BaseModel):
    id: UUID
    weekday: int
    starts_at: time
    ends_at: time
    capacity: int
    available_spots: int


class CatalogCourseResponse(BaseModel):
    id: UUID
    location_id: UUID
    location_name: str
    title: str
    description: str | None
    discipline: CourseDiscipline
    image_url: str | None
    sessions: list[CatalogSessionResponse]


CourseResponse.model_rebuild()
