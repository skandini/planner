from __future__ import annotations

from datetime import datetime, timedelta
from uuid import UUID

from sqlmodel import Session

from app.models import Event, Notification, User


def create_notification(
    session: Session,
    user_id: UUID,
    type: str,
    title: str,
    message: str,
    event_id: UUID | None = None,
) -> Notification:
    """Create a notification for a user."""
    notification = Notification(
        user_id=user_id,
        event_id=event_id,
        type=type,
        title=title,
        message=message,
    )
    session.add(notification)
    return notification


def notify_event_invited(
    session: Session,
    user_id: UUID,
    event: Event,
    inviter_name: str | None = None,
) -> None:
    """Notify user about event invitation."""
    inviter_text = f" от {inviter_name}" if inviter_name else ""
    notification = create_notification(
        session=session,
        user_id=user_id,
        type="event_invited",
        title="Приглашение на встречу",
        message=f"Вас пригласили на встречу «{event.title}»{inviter_text}",
        event_id=event.id,
    )
    print(f"[Notification] Created invitation notification {notification.id} for user {user_id} about event {event.id}")


def notify_event_updated(
    session: Session,
    user_id: UUID,
    event: Event,
    updater_name: str | None = None,
) -> None:
    """Notify user about event update."""
    updater_text = f" {updater_name}" if updater_name else ""
    create_notification(
        session=session,
        user_id=user_id,
        type="event_updated",
        title="Встреча изменена",
        message=f"Встреча «{event.title}» была изменена{updater_text}",
        event_id=event.id,
    )


def notify_event_cancelled(
    session: Session,
    user_id: UUID,
    event: Event,
    canceller_name: str | None = None,
) -> None:
    """Notify user about event cancellation."""
    canceller_text = f" {canceller_name}" if canceller_name else ""
    create_notification(
        session=session,
        user_id=user_id,
        type="event_cancelled",
        title="Встреча отменена",
        message=f"Встреча «{event.title}» была отменена{canceller_text}",
        event_id=event.id,
    )


def create_reminder_notification(
    session: Session,
    user_id: UUID,
    event: Event,
    reminder_minutes: int = 15,
) -> Notification:
    """Create a reminder notification for an event."""
    return create_notification(
        session=session,
        user_id=user_id,
        type="event_reminder",
        title="Напоминание о встрече",
        message=f"Через {reminder_minutes} минут: «{event.title}»",
        event_id=event.id,
    )


def notify_participant_response(
    session: Session,
    event: Event,
    participant: User,
    response_status: str,
    calendar_owner_id: UUID | None = None,
) -> None:
    """Notify event organizer about participant response."""
    if not calendar_owner_id:
        return
    
    status_labels = {
        "accepted": "принял",
        "declined": "отклонил",
    }
    
    status_label = status_labels.get(response_status, "изменил статус")
    participant_name = participant.full_name or participant.email
    
    create_notification(
        session=session,
        user_id=calendar_owner_id,
        type="participant_response",
        title="Ответ на приглашение",
        message=f"{participant_name} {status_label} приглашение на встречу «{event.title}»",
        event_id=event.id,
    )


def schedule_reminders_for_event(
    session: Session,
    event: Event,
    reminder_minutes: list[int] | None = None,
) -> None:
    """
    Schedule reminder notifications for all event participants.
    
    NOTE: Reminders are created when:
    - Event start time - reminder_minutes > current time
    - This function should be called periodically (e.g., every minute)
      to create reminders for upcoming events
    """
    from sqlmodel import select
    from app.models import EventParticipant
    
    if reminder_minutes is None:
        reminder_minutes = [5]  # 5 минут до встречи
    
    # Get all participants
    statement = select(EventParticipant).where(EventParticipant.event_id == event.id)
    participants = session.exec(statement).all()
    
    # Все времена в БД хранятся как naive datetime (без timezone)
    # Они представляют московское время
    event_start = event.starts_at
    if event_start.tzinfo:
        event_start = event_start.replace(tzinfo=None)
    
    # Текущее московское время (UTC+3)
    # Важно: используем московское время для сравнения!
    from datetime import timezone
    moscow_tz = timezone(timedelta(hours=3))
    now_moscow = datetime.now(moscow_tz).replace(tzinfo=None)
    
    for participant in participants:
        for reminder_mins in reminder_minutes:
            reminder_time = event_start - timedelta(minutes=reminder_mins)
            # Only schedule if reminder time is in the future (Moscow time)
            if reminder_time > now_moscow:
                create_reminder_notification(
                    session=session,
                    user_id=participant.user_id,
                    event=event,
                    reminder_minutes=reminder_mins,
                )

