"""Celery tasks for event reminders."""

from datetime import datetime, timedelta, timezone
from uuid import UUID

from sqlmodel import Session, select

from app.celery_app import celery_app
from app.db import engine
from app.models import Event, EventParticipant, Notification


@celery_app.task(name="app.tasks.reminders.send_event_reminders")
def send_event_reminders() -> dict[str, int]:
    """
    Периодическая задача для отправки напоминаний о предстоящих событиях.
    
    Запускается каждую минуту через Celery Beat.
    Находит события, которые начинаются через 5 минут, и создает напоминания для участников.
    
    Returns:
        dict: Статистика отправленных напоминаний
    """
    REMINDER_MINUTES = 5  # Напоминать за 5 минут до события
    
    # Московская временная зона
    moscow_tz = timezone(timedelta(hours=3))
    now_moscow = datetime.now(moscow_tz).replace(tzinfo=None)
    
    # Вычисляем временное окно для напоминаний
    # Ищем события которые начнутся через 4-6 минут (окно в 2 минуты для надежности)
    reminder_start = now_moscow + timedelta(minutes=REMINDER_MINUTES - 1)
    reminder_end = now_moscow + timedelta(minutes=REMINDER_MINUTES + 1)
    
    reminders_created = 0
    reminders_skipped = 0
    
    with Session(engine) as session:
        # Находим события в временном окне
        statement = select(Event).where(
            Event.starts_at >= reminder_start,
            Event.starts_at <= reminder_end,
            Event.status != "cancelled",  # Не отправляем напоминания для отмененных событий
        )
        events = session.exec(statement).all()
        
        for event in events:
            # Получаем участников события
            participants_statement = select(EventParticipant).where(
                EventParticipant.event_id == event.id,
                EventParticipant.response_status != "declined",  # Не напоминаем отклонившим
            )
            participants = session.exec(participants_statement).all()
            
            for participant in participants:
                # Проверяем, не создано ли уже напоминание для этого участника и события
                existing_reminder = session.exec(
                    select(Notification).where(
                        Notification.user_id == participant.user_id,
                        Notification.event_id == event.id,
                        Notification.type == "event_reminder",
                    )
                ).first()
                
                if existing_reminder:
                    # Напоминание уже создано, пропускаем
                    reminders_skipped += 1
                    continue
                
                # Создаем напоминание
                notification = Notification(
                    user_id=participant.user_id,
                    event_id=event.id,
                    type="event_reminder",
                    title="Напоминание о встрече",
                    message=f"Через {REMINDER_MINUTES} минут: «{event.title}»",
                    is_read=False,
                )
                session.add(notification)
                reminders_created += 1
                
                # Логируем для отладки
                print(
                    f"[Reminder] Created reminder for user {participant.user_id} "
                    f"about event '{event.title}' (starts at {event.starts_at})"
                )
        
        # Сохраняем все напоминания
        session.commit()
    
    result = {
        "reminders_created": reminders_created,
        "reminders_skipped": reminders_skipped,
        "events_checked": len(events),
    }
    
    print(
        f"[Reminder Task] Finished: {reminders_created} created, "
        f"{reminders_skipped} skipped, {len(events)} events checked"
    )
    
    return result

