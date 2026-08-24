from datetime import date
from uuid import UUID

from pydantic import BaseModel


class SubscriptionInfoResponse(BaseModel):
    starts_on: date
    duration_days: int
    expires_on: date
    is_active: bool


class AdminSubscriptionInfoResponse(SubscriptionInfoResponse):
    user_id: UUID
    user_email: str

