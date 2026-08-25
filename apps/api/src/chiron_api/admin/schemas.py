from datetime import date
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from chiron_api.db.models import BookingStatus, UserRole, UserStatus


class AdminUserCreate(BaseModel):
    email: str = Field(min_length=3, max_length=320)
    password: str = Field(min_length=12, max_length=256)
    first_name: str = Field(min_length=1, max_length=120)
    last_name: str = Field(min_length=1, max_length=120)
    phone: str | None = Field(default=None, max_length=40)
    birth_date: date | None = None
    role: UserRole = UserRole.USER


class AdminUserUpdate(BaseModel):
    email: str | None = Field(default=None, min_length=3, max_length=320)
    first_name: str | None = Field(default=None, min_length=1, max_length=120)
    last_name: str | None = Field(default=None, min_length=1, max_length=120)
    phone: str | None = Field(default=None, max_length=40)
    birth_date: date | None = None
    role: UserRole | None = None
    status: UserStatus | None = None


class AdminSubscriptionCreate(BaseModel):
    starts_on: date
    duration_days: int = Field(default=30, gt=0)


class AdminSubscriptionUpdate(BaseModel):
    starts_on: date | None = None
    duration_days: int | None = Field(default=None, gt=0)


class AdminUserSubscriptionResponse(BaseModel):
    id: UUID
    starts_on: date
    duration_days: int
    expires_on: date
    is_active: bool


class AdminUserResponse(BaseModel):
    id: UUID
    email: str
    role: UserRole
    status: UserStatus
    first_name: str | None
    last_name: str | None
    phone: str | None
    birth_date: date | None
    subscription: AdminUserSubscriptionResponse | None

    model_config = ConfigDict(from_attributes=True)


class AdminStatsItem(BaseModel):
    id: UUID
    name: str
    member_count: int


class AdminStatsResponse(BaseModel):
    active_members: int
    courses: list[AdminStatsItem]
    locations: list[AdminStatsItem]


class AdminCourseSessionAttendeeResponse(BaseModel):
    booking_id: UUID
    user_id: UUID
    email: str
    first_name: str | None
    last_name: str | None
    status: BookingStatus
