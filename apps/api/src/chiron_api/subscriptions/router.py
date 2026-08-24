from datetime import UTC, date, datetime
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from chiron_api.auth.dependencies import get_current_user, require_roles
from chiron_api.db.models import Subscription, User, UserRole
from chiron_api.db.session import get_db_session
from chiron_api.subscriptions.schemas import AdminSubscriptionInfoResponse, SubscriptionInfoResponse
from chiron_api.subscriptions.service import (
    is_subscription_active_on,
    latest_user_subscription,
    list_subscriptions,
)

router = APIRouter(tags=["subscriptions"])

backoffice_user = Depends(require_roles(UserRole.ADMIN, UserRole.STAFF))


def build_subscription_response(subscription: Subscription) -> SubscriptionInfoResponse:
    today = datetime.now(UTC).date()
    return SubscriptionInfoResponse(
        starts_on=subscription.starts_on,
        duration_days=subscription.duration_days,
        expires_on=subscription.expires_on,
        is_active=is_subscription_active_on(
            subscription.starts_on,
            subscription.duration_days,
            today,
        ),
    )


@router.get("/subscriptions/me", response_model=SubscriptionInfoResponse | None)
def my_subscription(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db_session),
) -> SubscriptionInfoResponse | None:
    subscription = latest_user_subscription(db, current_user.id)
    if subscription is None:
        return None
    return build_subscription_response(subscription)


@router.get("/admin/subscriptions", response_model=list[AdminSubscriptionInfoResponse])
def admin_subscriptions(
    _: User = backoffice_user,
    expires_before: date | None = Query(default=None),
    location_id: UUID | None = None,
    db: Session = Depends(get_db_session),
) -> list[AdminSubscriptionInfoResponse]:
    rows = list_subscriptions(db, expires_before=expires_before, location_id=location_id)

    response: list[AdminSubscriptionInfoResponse] = []
    for subscription, user in rows:
        info = build_subscription_response(subscription)
        response.append(
            AdminSubscriptionInfoResponse(
                **info.model_dump(),
                id=subscription.id,
                user_id=user.id,
                user_email=user.email,
            ),
        )

    return response
