from uuid import UUID

from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from chiron_api.auth.dependencies import get_current_user
from chiron_api.bookings.schemas import BookingCreate, BookingResponse
from chiron_api.bookings.service import cancel_booking, create_booking, list_user_bookings
from chiron_api.config import Settings, get_settings
from chiron_api.db.models import Booking, User
from chiron_api.db.session import get_db_session

router = APIRouter(prefix="/bookings", tags=["bookings"])


@router.post("", response_model=BookingResponse, status_code=status.HTTP_201_CREATED)
def create_user_booking(
    payload: BookingCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db_session),
    settings: Settings = Depends(get_settings),
) -> Booking:
    return create_booking(
        db,
        user=current_user,
        course_session_id=payload.course_session_id,
        settings=settings,
    )


@router.get("/me", response_model=list[BookingResponse])
def my_bookings(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db_session),
) -> list[Booking]:
    return list_user_bookings(db, user=current_user)


@router.delete("/{booking_id}", response_model=BookingResponse)
def cancel_user_booking(
    booking_id: UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db_session),
) -> Booking:
    return cancel_booking(db, user=current_user, booking_id=booking_id)

