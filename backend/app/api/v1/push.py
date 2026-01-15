from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlmodel import Session, select

from app.api.deps import SessionDep, get_current_user
from app.models.push_subscription import PushSubscription
from app.models.user import User
from app.schemas.push_subscription import PushSubscriptionCreate, PushSubscriptionRead

router = APIRouter()


@router.post("/subscribe", response_model=PushSubscriptionRead)
def subscribe_to_push(
    *,
    session: SessionDep,
    request: Request,
    payload: PushSubscriptionCreate,
    current_user: Annotated[User, Depends(get_current_user)],
) -> PushSubscription:
    """Subscribe user to web push notifications."""
    
    # Check if subscription already exists
    statement = select(PushSubscription).where(
        PushSubscription.user_id == current_user.id,
        PushSubscription.endpoint == payload.endpoint,
    )
    existing = session.exec(statement).first()
    
    if existing:
        # Update existing subscription
        existing.p256dh = payload.p256dh
        existing.auth = payload.auth
        existing.is_active = True
        existing.user_agent = request.headers.get("user-agent")
        existing.ip_address = request.client.host if request.client else None
        session.add(existing)
        session.commit()
        session.refresh(existing)
        return existing
    
    # Create new subscription
    subscription = PushSubscription(
        user_id=current_user.id,
        endpoint=payload.endpoint,
        p256dh=payload.p256dh,
        auth=payload.auth,
        user_agent=request.headers.get("user-agent"),
        ip_address=request.client.host if request.client else None,
    )
    session.add(subscription)
    session.commit()
    session.refresh(subscription)
    return subscription


@router.delete("/unsubscribe")
def unsubscribe_from_push(
    *,
    session: SessionDep,
    endpoint: str,
    current_user: Annotated[User, Depends(get_current_user)],
) -> dict:
    """Unsubscribe from web push notifications."""
    
    statement = select(PushSubscription).where(
        PushSubscription.user_id == current_user.id,
        PushSubscription.endpoint == endpoint,
    )
    subscription = session.exec(statement).first()
    
    if not subscription:
        raise HTTPException(status_code=404, detail="Subscription not found")
    
    subscription.is_active = False
    session.add(subscription)
    session.commit()
    
    return {"message": "Unsubscribed successfully"}


@router.get("/vapid-public-key")
def get_vapid_public_key() -> dict:
    """Get VAPID public key for push subscription."""
    from app.core.config import settings
    
    return {"publicKey": settings.VAPID_PUBLIC_KEY}


@router.get("/subscriptions", response_model=list[PushSubscriptionRead])
def list_user_subscriptions(
    *,
    session: SessionDep,
    current_user: Annotated[User, Depends(get_current_user)],
) -> list[PushSubscription]:
    """List user's active push subscriptions."""
    
    statement = select(PushSubscription).where(
        PushSubscription.user_id == current_user.id,
        PushSubscription.is_active == True,
    )
    return list(session.exec(statement).all())

