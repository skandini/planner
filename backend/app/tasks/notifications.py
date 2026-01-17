"""Celery tasks for notifications."""

from __future__ import annotations

# import json  # Not needed now
import logging
from uuid import UUID

# import redis  # WebSocket/Redis Pub/Sub disabled
from sqlmodel import Session, select

from app.celery_app import celery_app
from app.core.config import settings
from app.db import engine
from app.models import Event, Notification, User
# WebSocket and Web Push temporarily disabled - using HTTP polling
# from app.services.web_push import send_web_push_to_user

logger = logging.getLogger(__name__)

# Redis client for Pub/Sub (synchronous version for Celery)
# redis_client = redis.from_url(settings.REDIS_URL, decode_responses=True)


def publish_notification_to_websocket(user_id: UUID, notification: Notification):
    """
    Publish notification to Redis Pub/Sub for WebSocket broadcast.
    
    TEMPORARILY DISABLED - using HTTP polling instead.
    """
    # Disabled for now - no Redis Pub/Sub for WebSocket
    pass


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
            
            # WebSocket temporarily disabled - using HTTP polling
            # publish_notification_to_websocket(UUID(user_id), notification)
            
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
            
            # WebSocket and Web Push temporarily disabled - using HTTP polling
            # publish_notification_to_websocket(UUID(user_id), notification)
            
            # # Send Web Push notification
            # try:
            #     send_web_push_to_user(
            #         user_id=UUID(user_id),
            #         title="📅 Приглашение на встречу",
            #         body=f"Вас пригласили на встречу «{event.title}»{inviter_text}",
            #         url=f"/?eventId={event_id}",
            #     )
            # except Exception as e:
            #     logger.error(f"Failed to send web push: {e}")
            #     # Continue even if web push fails
            
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
            
            # Форматируем дату и время события для уведомления
            from datetime import datetime
            import pytz
            
            # Преобразуем в московское время для отображения
            moscow_tz = pytz.timezone('Europe/Moscow')
            event_start = event.starts_at
            if event_start.tzinfo is None:
                event_start = pytz.utc.localize(event_start)
            event_start_msk = event_start.astimezone(moscow_tz)
            
            # Форматируем дату и время
            date_str = event_start_msk.strftime('%d.%m.%Y')
            time_str = event_start_msk.strftime('%H:%M')
            event_time_info = f" Время проведения: {date_str} в {time_str}"
            
            notification = Notification(
                user_id=UUID(user_id),
                event_id=UUID(event_id),
                type="event_updated",
                title="Встреча изменена",
                message=f"Встреча «{event.title}» была изменена{updater_text}.{event_time_info}",
            )
            session.add(notification)
            session.commit()
            session.refresh(notification)
            
            logger.info(
                f"Created update notification {notification.id} "
                f"for user {user_id} about event {event_id}"
            )
            
            # WebSocket and Web Push temporarily disabled - using HTTP polling
            # publish_notification_to_websocket(UUID(user_id), notification)
            
            # # Send Web Push notification
            # try:
            #     send_web_push_to_user(
            #         user_id=UUID(user_id),
            #         title="🔔 Встреча изменена",
            #         body=f"Встреча «{event.title}» была изменена{updater_text}",
            #         url=f"/?eventId={event_id}",
            #     )
            # except Exception as e:
            #     logger.error(f"Failed to send web push: {e}")
            
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
            
            # WebSocket and Web Push temporarily disabled - using HTTP polling
            # publish_notification_to_websocket(UUID(user_id), notification)
            
            # # Send Web Push notification
            # try:
            #     send_web_push_to_user(
            #         user_id=UUID(user_id),
            #         title="❌ Встреча отменена",
            #         body=f"Встреча «{event.title}» была отменена{canceller_text}",
            #         url=f"/?eventId={event_id}",
            #     )
            # except Exception as e:
            #     logger.error(f"Failed to send web push: {e}")
            
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



