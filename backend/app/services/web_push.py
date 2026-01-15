import json
import logging
from datetime import datetime
from typing import Optional
from uuid import UUID

from pywebpush import webpush, WebPushException
from sqlmodel import Session, select

from app.core.config import settings
from app.db import engine
from app.models.push_subscription import PushSubscription

logger = logging.getLogger(__name__)


def send_web_push_to_user(
    user_id: UUID,
    title: str,
    body: str,
    url: str = "/",
    icon: str = "/icon-192.png",
    badge: str = "/badge-72.png",
) -> int:
    """
    Send web push notification to all active subscriptions of a user.
    
    Args:
        user_id: User ID to send notification to
        title: Notification title
        body: Notification body text
        url: URL to open when notification is clicked
        icon: Notification icon URL
        badge: Notification badge URL
    
    Returns:
        Number of successfully sent notifications.
    """
    if not settings.VAPID_PRIVATE_KEY or not settings.VAPID_PUBLIC_KEY:
        logger.warning("VAPID keys not configured, skipping web push")
        return 0
    
    with Session(engine) as session:
        # Get all active subscriptions for user
        statement = select(PushSubscription).where(
            PushSubscription.user_id == user_id,
            PushSubscription.is_active == True,
        )
        subscriptions = session.exec(statement).all()
        
        if not subscriptions:
            logger.info(f"No active push subscriptions for user {user_id}")
            return 0
        
        # Prepare notification data
        notification_data = {
            "title": title,
            "body": body,
            "icon": icon,
            "badge": badge,
            "url": url,
            "timestamp": datetime.utcnow().isoformat(),
        }
        
        sent_count = 0
        for subscription in subscriptions:
            try:
                # Send push notification
                webpush(
                    subscription_info={
                        "endpoint": subscription.endpoint,
                        "keys": {
                            "p256dh": subscription.p256dh,
                            "auth": subscription.auth,
                        }
                    },
                    data=json.dumps(notification_data),
                    vapid_private_key=settings.VAPID_PRIVATE_KEY,
                    vapid_claims={
                        "sub": settings.VAPID_CLAIMS_EMAIL
                    }
                )
                
                # Update last_used_at
                subscription.last_used_at = datetime.utcnow()
                session.add(subscription)
                sent_count += 1
                
                logger.info(f"Web push sent to user {user_id}, endpoint: {subscription.endpoint[:50]}...")
                
            except WebPushException as e:
                logger.error(f"Failed to send web push to user {user_id}: {e}")
                
                # If subscription is expired or invalid, deactivate it
                if e.response and e.response.status_code in [404, 410]:
                    logger.info(f"Deactivating invalid subscription for user {user_id}")
                    subscription.is_active = False
                    session.add(subscription)
        
        session.commit()
        
        logger.info(f"Web push: sent {sent_count}/{len(subscriptions)} to user {user_id}")
        return sent_count

