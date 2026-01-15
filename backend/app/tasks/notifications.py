"""Celery tasks for notifications."""

from __future__ import annotations

import json
import logging
from uuid import UUID

import redis
from sqlmodel import Session, select

from app.celery_app import celery_app
from app.core.config import settings
from app.db import engine
from app.models import Event, Notification, User
from app.services.web_push import send_web_push_to_user

logger = logging.getLogger(__name__)

# Redis client for Pub/Sub (synchronous version for Celery)
redis_client = redis.from_url(settings.REDIS_URL, decode_responses=True)


def publish_notification_to_websocket(user_id: UUID, notification: Notification):
    """
    Publish notification to Redis Pub/Sub for WebSocket broadcast.
    This provides INSTANT notifications to connected clients.
    """
    try:
        message = {
            "user_id": str(user_id),
            "notification": {
                "id": str(notification.id),
                "type": notification.type,
                "title": notification.title,
                "message": notification.message,
                "event_id": str(notification.event_id) if notification.event_id else None,
                "is_read": notification.is_read,
                "created_at": notification.created_at.isoformat() if notification.created_at else None,
            }
        }
        redis_client.publish("notifications", json.dumps(message))
        logger.info(f"Published notification to WebSocket via Redis Pub/Sub for user {user_id}")
    except Exception as e:
        logger.error(f"Failed to publish notification to Redis: {e}")
        # Don't fail the task if Redis publish fails


@celery_app.task(bind=True, max_retries=3, default_retry_delay=60)
def create_notification_task(
    self,
    user_id: str,
    type: str,
    title: str,
    message: str,
    event_id: str | None = None,
) -> dict:
    """
    Create a notification in the background.
    
    Args:
        user_id: User ID to notify
        type: Notification type
        title: Notification title
        message: Notification message
        event_id: Optional event ID
    
    Returns:
        dict: Result with notification ID or error
    """
    try:
        # Create new session for task
        with Session(engine) as session:
            notification = Notification(
                user_id=UUID(user_id),
                event_id=UUID(event_id) if event_id else None,
                type=type,
                title=title,
                message=message,
            )
            session.add(notification)
            session.commit()
            session.refresh(notification)
            
            logger.info(
                f"Created notification {notification.id} for user {user_id} "
                f"about event {event_id}"
            )
            
            # Publish to WebSocket via Redis Pub/Sub (INSTANT delivery!)
            publish_notification_to_websocket(UUID(user_id), notification)
            
            return {
                "success": True,
                "notification_id": str(notification.id),
                "user_id": user_id,
            }
    except Exception as exc:
        logger.error(
            f"Error creating notification for user {user_id}: {exc}",
            exc_info=True,
        )
        # Retry on failure
        raise self.retry(exc=exc)


@celery_app.task(bind=True, max_retries=3, default_retry_delay=60)
def notify_event_invited_task(
    self,
    user_id: str,
    event_id: str,
    inviter_name: str | None = None,
) -> dict:
    """
    Notify user about event invitation.
    
    Args:
        user_id: User ID to notify
        event_id: Event ID
        inviter_name: Name of the person who invited
    
    Returns:
        dict: Result with notification ID or error
    """
    try:
        with Session(engine) as session:
            event = session.get(Event, UUID(event_id))
            if not event:
                logger.warning(f"Event {event_id} not found for notification")
                return {"success": False, "error": "Event not found"}
            
            inviter_text = f" от {inviter_name}" if inviter_name else ""
            
            notification = Notification(
                user_id=UUID(user_id),
                event_id=UUID(event_id),
                type="event_invited",
                title="Приглашение на встречу",
                message=f"Вас пригласили на встречу «{event.title}»{inviter_text}",
            )
            session.add(notification)
            session.commit()
            session.refresh(notification)
            
            logger.info(
                f"Created invitation notification {notification.id} "
                f"for user {user_id} about event {event_id}"
            )
            
            # Publish to WebSocket via Redis Pub/Sub (INSTANT delivery!)
            publish_notification_to_websocket(UUID(user_id), notification)
            
            # Send Web Push notification
            try:
                send_web_push_to_user(
                    user_id=UUID(user_id),
                    title="📅 Приглашение на встречу",
                    body=f"Вас пригласили на встречу «{event.title}»{inviter_text}",
                    url=f"/?eventId={event_id}",
                )
            except Exception as e:
                logger.error(f"Failed to send web push: {e}")
                # Continue even if web push fails
            
            return {
                "success": True,
                "notification_id": str(notification.id),
                "user_id": user_id,
                "event_id": event_id,
            }
    except Exception as exc:
        logger.error(
            f"Error in notify_event_invited_task for user {user_id}, "
            f"event {event_id}: {exc}",
            exc_info=True,
        )
        raise self.retry(exc=exc)


@celery_app.task(bind=True, max_retries=3, default_retry_delay=60)
def notify_event_updated_task(
    self,
    user_id: str,
    event_id: str,
    updater_name: str | None = None,
) -> dict:
    """
    Notify user about event update.
    
    Args:
        user_id: User ID to notify
        event_id: Event ID
        updater_name: Name of the person who updated
    
    Returns:
        dict: Result with notification ID or error
    """
    try:
        with Session(engine) as session:
            event = session.get(Event, UUID(event_id))
            if not event:
                logger.warning(f"Event {event_id} not found for notification")
                return {"success": False, "error": "Event not found"}
            
            updater_text = f" {updater_name}" if updater_name else ""
            
            notification = Notification(
                user_id=UUID(user_id),
                event_id=UUID(event_id),
                type="event_updated",
                title="Встреча изменена",
                message=f"Встреча «{event.title}» была изменена{updater_text}",
            )
            session.add(notification)
            session.commit()
            session.refresh(notification)
            
            logger.info(
                f"Created update notification {notification.id} "
                f"for user {user_id} about event {event_id}"
            )
            
            # Publish to WebSocket via Redis Pub/Sub (INSTANT delivery!)
            publish_notification_to_websocket(UUID(user_id), notification)
            
            # Send Web Push notification
            try:
                send_web_push_to_user(
                    user_id=UUID(user_id),
                    title="🔔 Встреча изменена",
                    body=f"Встреча «{event.title}» была изменена{updater_text}",
                    url=f"/?eventId={event_id}",
                )
            except Exception as e:
                logger.error(f"Failed to send web push: {e}")
            
            return {
                "success": True,
                "notification_id": str(notification.id),
                "user_id": user_id,
                "event_id": event_id,
            }
    except Exception as exc:
        logger.error(
            f"Error in notify_event_updated_task for user {user_id}, "
            f"event {event_id}: {exc}",
            exc_info=True,
        )
        raise self.retry(exc=exc)


@celery_app.task(bind=True, max_retries=3, default_retry_delay=60)
def notify_event_cancelled_task(
    self,
    user_id: str,
    event_id: str,
    canceller_name: str | None = None,
) -> dict:
    """
    Notify user about event cancellation.
    
    Args:
        user_id: User ID to notify
        event_id: Event ID
        canceller_name: Name of the person who cancelled
    
    Returns:
        dict: Result with notification ID or error
    """
    try:
        with Session(engine) as session:
            event = session.get(Event, UUID(event_id))
            if not event:
                logger.warning(f"Event {event_id} not found for notification")
                return {"success": False, "error": "Event not found"}
            
            canceller_text = f" {canceller_name}" if canceller_name else ""
            
            notification = Notification(
                user_id=UUID(user_id),
                event_id=UUID(event_id),
                type="event_cancelled",
                title="Встреча отменена",
                message=f"Встреча «{event.title}» была отменена{canceller_text}",
            )
            session.add(notification)
            session.commit()
            session.refresh(notification)
            
            logger.info(
                f"Created cancellation notification {notification.id} "
                f"for user {user_id} about event {event_id}"
            )
            
            # Publish to WebSocket via Redis Pub/Sub (INSTANT delivery!)
            publish_notification_to_websocket(UUID(user_id), notification)
            
            # Send Web Push notification
            try:
                send_web_push_to_user(
                    user_id=UUID(user_id),
                    title="❌ Встреча отменена",
                    body=f"Встреча «{event.title}» была отменена{canceller_text}",
                    url=f"/?eventId={event_id}",
                )
            except Exception as e:
                logger.error(f"Failed to send web push: {e}")
            
            return {
                "success": True,
                "notification_id": str(notification.id),
                "user_id": user_id,
                "event_id": event_id,
            }
    except Exception as exc:
        logger.error(
            f"Error in notify_event_cancelled_task for user {user_id}, "
            f"event {event_id}: {exc}",
            exc_info=True,
        )
        raise self.retry(exc=exc)


@celery_app.task(bind=True, max_retries=3, default_retry_delay=60)
def notify_participant_response_task(
    self,
    calendar_owner_id: str,
    event_id: str,
    participant_name: str,
    response_status: str,
    old_status: str | None = None,
) -> dict:
    """
    Notify event organizer about participant response.
    
    Args:
        calendar_owner_id: Calendar owner (organizer) ID
        event_id: Event ID
        participant_name: Name of the participant
        response_status: New response status (accepted/declined)
        old_status: Previous response status (optional)
    
    Returns:
        dict: Result with notification ID or error
    """
    try:
        with Session(engine) as session:
            event = session.get(Event, UUID(event_id))
            if not event:
                logger.warning(f"Event {event_id} not found for notification")
                return {"success": False, "error": "Event not found"}
            
            status_labels = {
                "accepted": "принял",
                "declined": "отклонил",
            }
            
            status_label = status_labels.get(response_status, "изменил статус")
            message = (
                f"{participant_name} {status_label} приглашение "
                f"на встречу «{event.title}»"
            )
            
            notification = Notification(
                user_id=UUID(calendar_owner_id),
                event_id=UUID(event_id),
                type="participant_response",
                title="Ответ на приглашение",
                message=message,
            )
            session.add(notification)
            session.commit()
            session.refresh(notification)
            
            logger.info(
                f"Created participant response notification {notification.id} "
                f"for user {calendar_owner_id} about event {event_id}"
            )
            
            # Publish to WebSocket via Redis Pub/Sub (INSTANT delivery!)
            publish_notification_to_websocket(UUID(calendar_owner_id), notification)
            
            # Send Web Push notification
            try:
                send_web_push_to_user(
                    user_id=UUID(calendar_owner_id),
                    title="👥 Ответ на приглашение",
                    body=message,
                    url=f"/?eventId={event_id}",
                )
            except Exception as e:
                logger.error(f"Failed to send web push: {e}")
            
            return {
                "success": True,
                "notification_id": str(notification.id),
                "user_id": calendar_owner_id,
                "event_id": event_id,
            }
    except Exception as exc:
        logger.error(
            f"Error in notify_participant_response_task for user {calendar_owner_id}, "
            f"event {event_id}: {exc}",
            exc_info=True,
        )
        raise self.retry(exc=exc)

