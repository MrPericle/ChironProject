from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict

from chiron_api.db.models import BookingStatus


class BookingCreate(BaseModel):
    course_session_id: UUID


class BookingResponse(BaseModel):
    id: UUID
    user_id: UUID
    course_session_id: UUID
    status: BookingStatus
    created_at: datetime
    cancelled_at: datetime | None

    model_config = ConfigDict(from_attributes=True)

