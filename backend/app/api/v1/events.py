from __future__ import annotations

import logging
from calendar import monthrange
from datetime import datetime, timedelta
from typing import List, Literal, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlmodel import and_, delete, or_, select

logger = logging.getLogger(__name__)

from app.api.deps import get_current_user
from app.core.config import settings
from app.db import SessionDep
from app.models import Calendar, Event, EventAttachment, EventComment, EventParticipant, Notification, User
from app.schemas import (
    EventCreate,
    EventRead,
    EventParticipantRead,
    EventUpdate,
    ParticipantStatusUpdate,
    RecurrenceRule,
)
from app.schemas.event_attachment import EventAttachmentRead
from app.services.notifications import schedule_reminders_for_event
from app.tasks.notifications import (
    notify_event_cancelled_task,
    notify_event_invited_task,
    notify_event_updated_task,
    notify_participant_response_task,
)

router = APIRouter()


def _build_range_filter(
    *,
    calendar_id: Optional[UUID],
    starts_after: Optional[datetime],
    ends_before: Optional[datetime],
):
    conditions = []
    if calendar_id:
        conditions.append(Event.calendar_id == calendar_id)
    if starts_after:
        conditions.append(Event.starts_at >= starts_after)
    if ends_before:
        conditions.append(Event.ends_at <= ends_before)
    return and_(*conditions) if conditions else None


def _load_event_participants(
    session: SessionDep, event_id: UUID
) -> List[EventParticipantRead]:
    from sqlalchemy import select as sql_select
    stmt = (
        sql_select(EventParticipant, User)
        .join(User, EventParticipant.user_id == User.id)
        .where(EventParticipant.event_id == event_id)
    )
    rows = session.exec(stmt).all()
    return [
        EventParticipantRead(
            user_id=p.user_id,
            email=u.email,
            full_name=u.full_name,
            response_status=p.response_status
        )
        for p, u in rows
    ]


def _get_event_participant_ids(session: SessionDep, event_id: UUID) -> List[UUID]:
    return session.exec(
        select(EventParticipant.user_id).where(
            EventParticipant.event_id == event_id
        )
    ).all()


MAX_RECURRENCE_OCCURRENCES = 180


def _add_months(base: datetime, months: int) -> datetime:
    """Добавляет месяцы к дате, корректно обрабатывая граничные случаи"""
    # Убеждаемся, что datetime naive (без tzinfo)
    if base.tzinfo is not None:
        base = base.replace(tzinfo=None)
    
    month_index = base.month - 1 + months
    year = base.year + month_index // 12
    month = month_index % 12 + 1
    day = min(base.day, monthrange(year, month)[1])
    
    try:
        # Создаем новый datetime с правильными значениями
        result = datetime(year, month, day, base.hour, base.minute, base.second, base.microsecond)
        return result
    except (ValueError, OSError) as e:
        logger.error(f"Error in _add_months: {e}, base: {base}, months: {months}, year: {year}, month: {month}, day: {day}")
        # Fallback: используем replace, но только если base naive
        if base.tzinfo is None:
            return base.replace(year=year, month=month, day=day)
        raise


def _advance_recurrence(start: datetime, rule: RecurrenceRule) -> datetime:
    if rule.frequency == "daily":
        return start + timedelta(days=rule.interval)
    elif rule.frequency == "weekly":
        return start + timedelta(weeks=rule.interval)
    elif rule.frequency == "monthly":
        return _add_months(start, rule.interval)
    elif rule.frequency == "yearly":
        return _add_months(start, rule.interval * 12)
    return start


def _generate_recurrence_starts(
    base_start: datetime, rule: RecurrenceRule
) -> List[datetime]:
    additional: List[datetime] = []
    current = base_start
    until = rule.until.replace(tzinfo=None) if rule.until else None

    while len(additional) < MAX_RECURRENCE_OCCURRENCES:
        current = _advance_recurrence(current, rule)
        if until and current > until:
            break
        if rule.count and len(additional) >= rule.count - 1:
            break
        additional.append(current)
        if not rule.count and until is None and len(additional) >= MAX_RECURRENCE_OCCURRENCES:
            break

    return additional


def _attach_participants(
    session: SessionDep, event_id: UUID, participant_ids: List[UUID]
) -> None:
    """
    Добавляет участников к событию.
    Не требует проверки доступа к календарю - любой может пригласить любого.
    """
    for user_id in participant_ids:
        # Проверяем, не добавлен ли уже этот участник
        existing = session.exec(
            select(EventParticipant).where(
                EventParticipant.event_id == event_id,
                EventParticipant.user_id == user_id,
            )
        ).one_or_none()
        if not existing:
            participant = EventParticipant(
                event_id=event_id, user_id=user_id, response_status="needs_action"
            )
            session.add(participant)


def _load_event_attachments(
    session: SessionDep, event_id: UUID
) -> List[EventAttachmentRead]:
    """Загрузить вложения события."""
    from app.models import EventAttachment
    attachments = session.exec(
        select(EventAttachment).where(EventAttachment.event_id == event_id)
    ).all()
    return [EventAttachmentRead.model_validate(att) for att in attachments]


def _serialize_event_with_participants(
    session: SessionDep, event: Event
) -> EventRead:
    participants = _load_event_participants(session, event.id)
    attachments = _load_event_attachments(session, event.id)
    
    # Get department color from the first participant (or calendar owner)
    department_color = None
    if participants:
        from app.models import Department
        first_participant = participants[0]
        # Get user's department
        user = session.get(User, first_participant.user_id)
        if user and user.department_id:
            dept = session.get(Department, user.department_id)
            if dept and dept.color:
                department_color = dept.color
    else:
        # If no participants, check calendar owner's department
        calendar = session.get(Calendar, event.calendar_id)
        if calendar and calendar.owner_id:
            from app.models import Department
            owner = session.get(User, calendar.owner_id)
            if owner and owner.department_id:
                dept = session.get(Department, owner.department_id)
                if dept and dept.color:
                    department_color = dept.color
    
    # Get room online meeting URL if room is assigned
    room_online_meeting_url = None
    if event.room_id:
        from app.models import Room
        room = session.get(Room, event.room_id)
        if room and room.online_meeting_url:
            room_online_meeting_url = room.online_meeting_url
    
    return EventRead.model_validate(event).model_copy(
        update={
            "participants": participants,
            "attachments": attachments,
            "department_color": department_color,
            "room_online_meeting_url": room_online_meeting_url,
        }
    )




def _ensure_no_conflicts(
    session: SessionDep,
    *,
    calendar_id: UUID,
    starts_at: datetime,
    ends_at: datetime,
    room_id: UUID | None,
    participant_ids: list[UUID],
    exclude_event_id: UUID | None = None,
) -> None:
    filters = [
        Event.calendar_id == calendar_id,
        Event.starts_at < ends_at,
        Event.ends_at > starts_at,
    ]
    if exclude_event_id:
        filters.append(Event.id != exclude_event_id)

    if room_id:
        room_conflict = session.exec(
            select(Event).where(Event.room_id == room_id, *filters)
        ).first()
        if room_conflict:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Переговорка занята событием «{room_conflict.title}».",
            )

    if participant_ids:
        # Получаем список участников, которые уже подтвердили участие в событии (если это обновление)
        confirmed_participant_ids = set()
        if exclude_event_id:
            # Это обновление события - проверяем, кто уже подтвердил участие
            confirmed_participants = session.exec(
                select(EventParticipant.user_id).where(
                    EventParticipant.event_id == exclude_event_id,
                    EventParticipant.response_status == "accepted"
                )
            ).all()
            confirmed_participant_ids = set(confirmed_participants)
        
        # Расписание доступности удалено - проверка больше не выполняется
        
        # Проверяем конфликты участников во ВСЕХ календарях
        # Учитываем:
        # 1. События, где участник является участником (через EventParticipant)
        # 2. События из личных календарей участника (где он владелец)
        # Это дает полную занятость независимо от календаря
        
        # События, где участники являются участниками
        participant_events_subquery = select(EventParticipant.event_id).where(
            EventParticipant.user_id.in_(participant_ids)
        )
        
        # Личные календари участников
        participant_calendars_subquery = select(Calendar.id).where(
            Calendar.owner_id.in_(participant_ids)
        )
        
        # Фильтры для проверки конфликтов
        conflict_filters = [
            or_(
                Event.id.in_(participant_events_subquery),
                Event.calendar_id.in_(participant_calendars_subquery),
            ),
            Event.starts_at < ends_at,
            Event.ends_at > starts_at,
        ]
        if exclude_event_id:
            conflict_filters.append(Event.id != exclude_event_id)
        
        # Проверяем конфликты
        conflict_event = session.exec(
            select(Event)
            .where(*conflict_filters)
        ).first()
        
        if conflict_event:
            # Находим пользователя, у которого конфликт
            # Проверяем, является ли он участником конфликтующего события
            conflict_participant = session.exec(
                select(EventParticipant, User)
                .join(User, User.id == EventParticipant.user_id)
                .where(
                    EventParticipant.event_id == conflict_event.id,
                    EventParticipant.user_id.in_(participant_ids),
                )
            ).first()
            
            if conflict_participant:
                _, conflict_user = conflict_participant
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail=(
                        f"Участник {conflict_user.full_name or conflict_user.email} "
                        f"уже занят в событии «{conflict_event.title}»."
                    ),
                )
            else:
                # Конфликт в личном календаре участника
                # Находим владельца календаря
                conflict_calendar = session.get(Calendar, conflict_event.calendar_id)
                if conflict_calendar and conflict_calendar.owner_id in participant_ids:
                    conflict_user = session.get(User, conflict_calendar.owner_id)
                    if conflict_user:
                        raise HTTPException(
                            status_code=status.HTTP_409_CONFLICT,
                            detail=(
                                f"Участник {conflict_user.full_name or conflict_user.email} "
                                f"уже занят в событии «{conflict_event.title}»."
                            ),
                        )


@router.get("/", response_model=List[EventRead], summary="List events")
def list_events(
    session: SessionDep,
    current_user: User = Depends(get_current_user),
    calendar_id: Optional[UUID] = None,
    starts_after: Optional[datetime] = Query(
        default=None, alias="from", description="ISO timestamp filter start"
    ),
    ends_before: Optional[datetime] = Query(
        default=None, alias="to", description="ISO timestamp filter end"
    ),
) -> List[EventRead]:
    # Упрощенная логика: показываем события из личных календарей пользователя
    # и события, где пользователь является участником
    if calendar_id:
        # Проверяем, что календарь существует и принадлежит пользователю
        calendar = session.get(Calendar, calendar_id)
        if not calendar:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Calendar not found",
            )
        if calendar.owner_id != current_user.id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Access to calendar denied",
            )

    filter_expr = _build_range_filter(
        calendar_id=calendar_id, starts_after=starts_after, ends_before=ends_before
    )

    # Личные календари пользователя
    personal_calendars_subquery = select(Calendar.id).where(
        Calendar.owner_id == current_user.id
    )

    # События, где пользователь является участником
    participant_events_subquery = select(EventParticipant.event_id).where(
        EventParticipant.user_id == current_user.id
    )

    statement = (
        select(Event)
        .where(
            or_(
                Event.calendar_id.in_(personal_calendars_subquery),
                Event.id.in_(participant_events_subquery),
            )
        )
    )
    if filter_expr is not None:
        statement = statement.where(filter_expr)
    statement = statement.order_by(Event.starts_at)
    events = session.exec(statement).all()
    
    # Логируем только в development
    if settings.ENVIRONMENT != "production":
        logger.debug(f"Found {len(events)} events for user {current_user.id}")

    # Предзагружаем календари для всех событий одним запросом
    calendar_ids = {event.calendar_id for event in events}
    calendars = {}
    if calendar_ids:
        calendars = {
            cal.id: cal
            for cal in session.exec(select(Calendar).where(Calendar.id.in_(calendar_ids))).all()
        }

    # Предзагружаем участников для всех событий одним запросом
    event_ids = [event.id for event in events]
    participants_map = {}
    if event_ids:
        participants = session.exec(
            select(EventParticipant, User)
            .join(User, EventParticipant.user_id == User.id)
            .where(EventParticipant.event_id.in_(event_ids))
        ).all()
        for p, u in participants:
            if p.event_id not in participants_map:
                participants_map[p.event_id] = []
            participants_map[p.event_id].append(
                EventParticipantRead(
                    user_id=p.user_id,
                    email=u.email,
                    full_name=u.full_name,
                    response_status=p.response_status
                )
            )

    # Предзагружаем вложения для всех событий одним запросом
    attachments_map = {}
    if event_ids:
        from app.models import EventAttachment
        attachments = session.exec(
            select(EventAttachment).where(EventAttachment.event_id.in_(event_ids))
        ).all()
        for att in attachments:
            if att.event_id not in attachments_map:
                attachments_map[att.event_id] = []
            attachments_map[att.event_id].append(EventAttachmentRead.model_validate(att))

    # Предзагружаем комнаты для всех событий одним запросом
    from app.models import Room
    room_ids = {event.room_id for event in events if event.room_id}
    rooms_map = {}
    if room_ids:
        rooms = session.exec(select(Room).where(Room.id.in_(room_ids))).all()
        rooms_map = {r.id: r for r in rooms}

    # Предзагружаем департаменты для участников и владельцев календарей
    from app.models import Department
    user_ids = set()
    for participants_list in participants_map.values():
        for p in participants_list:
            user_ids.add(p.user_id)
    for calendar in calendars.values():
        if calendar.owner_id:
            user_ids.add(calendar.owner_id)
    
    departments_map = {}
    if user_ids:
        users_with_depts = session.exec(
            select(User).where(User.id.in_(user_ids), User.department_id.isnot(None))
        ).all()
        dept_ids = {u.department_id for u in users_with_depts if u.department_id}
        if dept_ids:
            depts = session.exec(select(Department).where(Department.id.in_(dept_ids))).all()
            departments_map = {d.id: d for d in depts}
        
        # Создаем маппинг user_id -> department_color
        user_dept_colors = {}
        for u in users_with_depts:
            if u.department_id and u.department_id in departments_map:
                dept = departments_map[u.department_id]
                if dept.color:
                    user_dept_colors[u.id] = dept.color

    serialized: list[EventRead] = []
    for event in events:
        # Если календарь отсутствует (например, удален), пропускаем событие
        if event.calendar_id not in calendars:
            continue
        
        # Используем предзагруженные данные
        participants = participants_map.get(event.id, [])
        attachments = attachments_map.get(event.id, [])
        
        # Get department color from the first participant (or calendar owner)
        department_color = None
        if participants:
            first_participant = participants[0]
            department_color = user_dept_colors.get(first_participant.user_id)
        else:
            # If no participants, check calendar owner's department
            calendar = calendars.get(event.calendar_id)
            if calendar and calendar.owner_id:
                department_color = user_dept_colors.get(calendar.owner_id)
        
        # Get room online meeting URL if room is assigned
        room_online_meeting_url = None
        if event.room_id and event.room_id in rooms_map:
            room = rooms_map[event.room_id]
            if room.online_meeting_url:
                room_online_meeting_url = room.online_meeting_url
        
        serialized.append(
            EventRead.model_validate(event).model_copy(
                update={
                    "participants": participants,
                    "attachments": attachments,
                    "department_color": department_color,
                    "room_online_meeting_url": room_online_meeting_url,
                }
            )
        )

    # Логируем только в development
    if settings.ENVIRONMENT != "production":
        logger.debug(f"Returning {len(serialized)} serialized events")
    return serialized


@router.get("/{event_id}", response_model=EventRead, summary="Get event by id")
def get_event(
    event_id: UUID,
    session: SessionDep,
    current_user: User = Depends(get_current_user),
) -> EventRead:
    event = session.get(Event, event_id)
    if not event:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Event not found",
        )
    
    # Упрощенная логика: проверяем, является ли пользователь владельцем календаря или участником события
    calendar = session.get(Calendar, event.calendar_id)
    if not calendar:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Calendar not found",
        )
    
    # Проверяем, является ли пользователь владельцем календаря
    is_owner = calendar.owner_id == current_user.id
    
    # Проверяем, является ли пользователь участником события
    participant = session.exec(
        select(EventParticipant).where(
            EventParticipant.event_id == event_id,
            EventParticipant.user_id == current_user.id,
        )
    ).one_or_none()
    is_participant = participant is not None
    
    if not is_owner and not is_participant:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access to event denied",
        )

    return _serialize_event_with_participants(session, event)


@router.post(
    "/",
    response_model=EventRead,
    status_code=status.HTTP_201_CREATED,
    summary="Create event",
)
def create_event(
    payload: EventCreate,
    session: SessionDep,
    current_user: User = Depends(get_current_user),
) -> EventRead:
    # Упрощенная логика: проверяем только, что календарь существует
    # Пользователь может создавать события в любом календаре, где он является владельцем
    # Или приглашать участников в события без проверки доступа к календарю
    calendar = session.get(Calendar, payload.calendar_id)
    if not calendar:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Calendar not found",
        )
    
    # Проверяем, что пользователь является владельцем календаря
    # Это базовая проверка безопасности
    if calendar.owner_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only calendar owner can create events in this calendar",
        )

    recurrence_rule = payload.recurrence_rule
    if recurrence_rule and not (recurrence_rule.count or recurrence_rule.until):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Укажите количество повторений или дату окончания серии",
        )

    participant_ids = payload.participant_ids or []
    data = payload.model_dump(exclude={"participant_ids"})
    if recurrence_rule:
        data["recurrence_rule"] = recurrence_rule.model_dump(exclude_none=True)
    else:
        data.pop("recurrence_rule", None)

    _ensure_no_conflicts(
        session,
        calendar_id=payload.calendar_id,
        starts_at=data["starts_at"],
        ends_at=data["ends_at"],
        room_id=data.get("room_id"),
        participant_ids=participant_ids,
    )

    event = Event(**data)
    session.add(event)
    session.flush()
    if participant_ids:
        _attach_participants(session, event.id, participant_ids)

    duration = data["ends_at"] - data["starts_at"]

    if recurrence_rule:
        additional_starts = _generate_recurrence_starts(
            event.starts_at, recurrence_rule
        )
        for occurrence_start in additional_starts:
            occurrence_end = occurrence_start + duration
            _ensure_no_conflicts(
                session,
                calendar_id=payload.calendar_id,
                starts_at=occurrence_start,
                ends_at=occurrence_end,
                room_id=data.get("room_id"),
                participant_ids=participant_ids,
            )
            child_event = Event(
                calendar_id=event.calendar_id,
                room_id=event.room_id,
                title=event.title,
                description=event.description,
                location=event.location,
                timezone=event.timezone,
                starts_at=occurrence_start,
                ends_at=occurrence_end,
                all_day=event.all_day,
                status=event.status,
                recurrence_parent_id=event.id,
            )
            session.add(child_event)
            session.flush()
            if participant_ids:
                _attach_participants(session, child_event.id, participant_ids)

    # Schedule reminders (синхронно, так как это быстрая операция)
    schedule_reminders_for_event(session, event)

    session.commit()
    session.refresh(event)

    # Create notifications for participants (асинхронно через Celery)
    if participant_ids:
        inviter_name = current_user.full_name or current_user.email
        logger.info(f"Creating notifications for {len(participant_ids)} participants for event {event.id}")
        
        for participant_id in participant_ids:
            if participant_id != current_user.id:  # Don't notify yourself
                try:
                    result = notify_event_invited_task.delay(
                        user_id=str(participant_id),
                        event_id=str(event.id),
                        inviter_name=inviter_name,
                    )
                    logger.info(f"Sent notification task {result.id} to Celery for user {participant_id}")
                except Exception as e:
                    logger.error(f"Failed to send notification task for user {participant_id}: {e}", exc_info=True)

    serialized_event = _serialize_event_with_participants(session, event)

    return serialized_event


@router.put("/{event_id}", response_model=EventRead, summary="Update event")
def update_event(
    event_id: UUID,
    payload: EventUpdate,
    session: SessionDep,
    current_user: User = Depends(get_current_user),
    scope: Literal["single", "series"] = Query(
        default="single",
        description="single — изменить только это событие, series — всю серию",
    ),
) -> EventRead:
    event = session.get(Event, event_id)
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")

    # Проверяем, что пользователь является владельцем календаря
    calendar = session.get(Calendar, event.calendar_id)
    if not calendar:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Calendar not found",
        )
    if calendar.owner_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only calendar owner can update events",
        )

    if scope == "series":
        if not payload.starts_at:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Укажите новое время начала, чтобы переместить серию",
            )
        new_start_normalized = (
            payload.starts_at.replace(tzinfo=None)
            if payload.starts_at.tzinfo
            else payload.starts_at
        )
        current_start = (
            event.starts_at.replace(tzinfo=None)
            if event.starts_at.tzinfo
            else event.starts_at
        )
        delta = new_start_normalized - current_start
        if delta.total_seconds() == 0:
            return _serialize_event_with_participants(session, event)

        root_id = event.recurrence_parent_id or event.id
        series_events = session.exec(
            select(Event).where(
                or_(Event.id == root_id, Event.recurrence_parent_id == root_id)
            )
        ).all()

        updated: List[tuple[Event, datetime, datetime]] = []
        for target in series_events:
            # Убеждаемся, что datetime naive перед операциями
            target_start = target.starts_at.replace(tzinfo=None) if target.starts_at.tzinfo else target.starts_at
            target_end = target.ends_at.replace(tzinfo=None) if target.ends_at.tzinfo else target.ends_at
            new_start = target_start + delta
            new_end = target_end + delta
            participant_ids = _get_event_participant_ids(session, target.id)
            _ensure_no_conflicts(
                session,
                calendar_id=target.calendar_id,
                starts_at=new_start,
                ends_at=new_end,
                room_id=target.room_id,
                participant_ids=participant_ids,
                exclude_event_id=target.id,
            )
            updated.append((target, new_start, new_end))

        for target, new_start, new_end in updated:
            target.starts_at = new_start
            target.ends_at = new_end
            target.touch()
            session.add(target)

        session.commit()
        session.refresh(event)
        return _serialize_event_with_participants(session, event)

    data = payload.model_dump(
        exclude_unset=True, exclude={"participant_ids", "recurrence_rule"}
    )
    # Безопасная обработка datetime: проверяем наличие и корректность перед удалением tzinfo
    # Pydantic автоматически конвертирует ISO строки в datetime, но может оставить tzinfo
    if "starts_at" in data and data["starts_at"] is not None:
        try:
            if isinstance(data["starts_at"], datetime):
                # Удаляем tzinfo, если он есть, чтобы сохранить в БД как naive datetime
                if data["starts_at"].tzinfo is not None:
                    data["starts_at"] = data["starts_at"].replace(tzinfo=None)
            else:
                logger.warning(f"starts_at is not a datetime object: {type(data['starts_at'])}, value: {data['starts_at']}")
        except (AttributeError, ValueError, OSError) as e:
            logger.error(f"Error processing starts_at: {e}, type: {type(data.get('starts_at'))}, value: {data.get('starts_at')}")
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid starts_at format: {str(e)}"
            )
    if "ends_at" in data and data["ends_at"] is not None:
        try:
            if isinstance(data["ends_at"], datetime):
                # Удаляем tzinfo, если он есть, чтобы сохранить в БД как naive datetime
                if data["ends_at"].tzinfo is not None:
                    data["ends_at"] = data["ends_at"].replace(tzinfo=None)
            else:
                logger.warning(f"ends_at is not a datetime object: {type(data['ends_at'])}, value: {data['ends_at']}")
        except (AttributeError, ValueError, OSError) as e:
            logger.error(f"Error processing ends_at: {e}, type: {type(data.get('ends_at'))}, value: {data.get('ends_at')}")
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid ends_at format: {str(e)}"
            )
    # Получаем новые значения времени, убеждаясь что они валидны
    new_starts_at = data.get("starts_at", event.starts_at)
    new_ends_at = data.get("ends_at", event.ends_at)
    new_room_id = data.get("room_id", event.room_id)
    
    # Валидация datetime значений - проверяем, что они не содержат недопустимых значений
    if isinstance(new_starts_at, datetime):
        try:
            # Проверяем, что datetime валиден, пытаясь создать новый объект с теми же значениями
            datetime(new_starts_at.year, new_starts_at.month, new_starts_at.day, 
                    new_starts_at.hour, new_starts_at.minute, new_starts_at.second, 
                    new_starts_at.microsecond)
        except (ValueError, OSError) as e:
            logger.error(f"Invalid starts_at datetime: {e}, value: {new_starts_at}")
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid starts_at datetime: {str(e)}"
            )
    if isinstance(new_ends_at, datetime):
        try:
            # Проверяем, что datetime валиден
            datetime(new_ends_at.year, new_ends_at.month, new_ends_at.day, 
                    new_ends_at.hour, new_ends_at.minute, new_ends_at.second, 
                    new_ends_at.microsecond)
        except (ValueError, OSError) as e:
            logger.error(f"Invalid ends_at datetime: {e}, value: {new_ends_at}")
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid ends_at datetime: {str(e)}"
            )

    update_payload = payload.model_dump(exclude_unset=True)
    if "participant_ids" in update_payload:
        new_participant_ids = payload.participant_ids or []
    else:
        new_participant_ids = _get_event_participant_ids(session, event_id)

    _ensure_no_conflicts(
        session,
        calendar_id=event.calendar_id,
        starts_at=new_starts_at,
        ends_at=new_ends_at,
        room_id=new_room_id,
        participant_ids=new_participant_ids,
        exclude_event_id=event_id,
    )

    # Безопасно обновляем поля события
    for field, value in data.items():
        try:
            # Для datetime полей убеждаемся, что они naive
            if field in ("starts_at", "ends_at") and isinstance(value, datetime):
                logger.info(f"Processing {field}: {value}, tzinfo: {value.tzinfo}")
                if value.tzinfo is not None:
                    try:
                        value = value.replace(tzinfo=None)
                        logger.info(f"Removed tzinfo from {field}: {value}")
                    except (ValueError, OSError) as e:
                        logger.error(f"Error removing tzinfo from {field}: {e}, value: {value}")
                        # Пробуем создать новый datetime без tzinfo
                        value = datetime(
                            value.year, value.month, value.day,
                            value.hour, value.minute, value.second, value.microsecond
                        )
                        logger.info(f"Created new datetime for {field}: {value}")
            setattr(event, field, value)
            logger.info(f"Set {field} = {value}")
        except (ValueError, OSError, AttributeError, TypeError) as e:
            logger.error(f"Error setting field {field} to {value}: {e}, type: {type(value)}, exc_info=True", exc_info=True)
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid value for {field}: {str(e)}"
            )
    
    try:
        logger.info(f"Touching event, starts_at: {event.starts_at}, ends_at: {event.ends_at}")
        event.touch()
        logger.info("Event touched successfully")
        session.add(event)
        logger.info("Event added to session")
        session.commit()
        logger.info("Event committed successfully")
        session.refresh(event)
        logger.info("Event refreshed successfully")
    except (ValueError, OSError, TypeError) as e:
        logger.error(f"Error saving event: {e}, event.starts_at: {event.starts_at} (type: {type(event.starts_at)}), event.ends_at: {event.ends_at} (type: {type(event.ends_at)})", exc_info=True)
        session.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error saving event: {str(e)}"
        )
    
    # Notify participants about update (асинхронно через Celery)
    participant_ids = _get_event_participant_ids(session, event_id)
    updater_name = current_user.full_name or current_user.email
    for participant_id in participant_ids:
        if participant_id != current_user.id:  # Don't notify yourself
            notify_event_updated_task.delay(
                user_id=str(participant_id),
                event_id=str(event_id),
                updater_name=updater_name,
            )

    if "participant_ids" in payload.model_dump(exclude_unset=True):
        existing = session.exec(
            select(EventParticipant).where(EventParticipant.event_id == event_id)
        ).all()
        existing_user_ids = {ep.user_id for ep in existing}
        existing_participants_map = {ep.user_id: ep for ep in existing}
        new_participant_ids_set = set(new_participant_ids)
        
        # Удаляем участников, которых больше нет
        to_remove = existing_user_ids - new_participant_ids_set
        if to_remove:
            session.exec(
                delete(EventParticipant).where(
                    EventParticipant.event_id == event_id,
                    EventParticipant.user_id.in_(to_remove),
                )
            )
        
        # Добавляем новых участников
        to_add = new_participant_ids_set - existing_user_ids
        for user_id in to_add:
            participant = EventParticipant(
                event_id=event_id,
                user_id=user_id,
                response_status="needs_action",
            )
            session.add(participant)
            # Отправляем уведомление новым участникам (асинхронно через Celery)
            if user_id != current_user.id:
                notify_event_invited_task.delay(
                    user_id=str(user_id),
                    event_id=str(event_id),
                    inviter_name=updater_name,
                )
        
        # Сохраняем статусы ответов существующих участников
        for user_id in existing_user_ids & new_participant_ids_set:
            existing_participant = existing_participants_map[user_id]
            if existing_participant.response_status in ("accepted", "declined"):
                # Сохраняем статус ответа при обновлении события
                pass

    session.commit()
    session.refresh(event)
    return _serialize_event_with_participants(session, event)


@router.patch(
    "/{event_id}/participants/{user_id}/status",
    response_model=EventRead,
    summary="Update participant response status",
)
def update_participant_status(
    event_id: UUID,
    user_id: UUID,
    payload: ParticipantStatusUpdate,
    session: SessionDep,
    current_user: User = Depends(get_current_user),
) -> EventRead:
    try:
        # Упрощенная логика: проверяем только, что пользователь обновляет свой собственный статус
        if current_user.id != user_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You can only update your own participant status",
            )

        event = session.get(Event, event_id)
        if not event:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Event not found",
            )

        # Проверяем, является ли пользователь участником события
        # Не требуем доступа к календарю - достаточно быть участником события
        participant = session.exec(
            select(EventParticipant).where(
                EventParticipant.event_id == event_id,
                EventParticipant.user_id == user_id,
            )
        ).one_or_none()

        if not participant:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Participant not found. You must be invited to the event first.",
            )

        old_status = participant.response_status
        participant.response_status = payload.response_status
        session.add(participant)
        session.commit()

        # Уведомляем организатора события об изменении статуса участника (асинхронно через Celery)
        calendar = session.get(Calendar, event.calendar_id)
        if calendar and calendar.owner_id:
            if calendar.owner_id != current_user.id:
                try:
                    participant_name = current_user.full_name or current_user.email
                    notify_participant_response_task.delay(
                        calendar_owner_id=str(calendar.owner_id),
                        event_id=str(event_id),
                        participant_name=participant_name,
                        response_status=payload.response_status,
                        old_status=old_status,
                    )
                except Exception as e:
                    # Логируем ошибку уведомления, но не прерываем обновление статуса
                    import logging
                    logger = logging.getLogger(__name__)
                    logger.warning(f"Failed to send notification: {e}", exc_info=True)

        session.refresh(event)
        return _serialize_event_with_participants(session, event)
    except HTTPException:
        # Пробрасываем HTTPException как есть
        raise
    except Exception as e:
        # Логируем неожиданные ошибки
        import traceback
        print(f"[ERROR] update_participant_status failed: {str(e)}")
        print(traceback.format_exc())
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to update participant status: {str(e)}"
        )


@router.delete(
    "/{event_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete event",
    response_model=None,
)
def delete_event(
    event_id: UUID,
    session: SessionDep,
    current_user: User = Depends(get_current_user),
    scope: Literal["single", "series"] = Query(
        default="single",
        description="single — удалить только событие, series — удалить всю серию",
    ),
) -> None:
    event = session.get(Event, event_id)
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")

    # Проверяем, что пользователь является владельцем календаря
    calendar = session.get(Calendar, event.calendar_id)
    if not calendar:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Calendar not found",
        )
    if calendar.owner_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only calendar owner can delete events",
        )

    # Get participants before deletion
    participant_ids = _get_event_participant_ids(session, event_id)
    canceller_name = current_user.full_name or current_user.email

    if scope == "series":
        root_id = event.recurrence_parent_id or event.id
        series_ids = session.exec(
            select(Event.id).where(
                or_(Event.id == root_id, Event.recurrence_parent_id == root_id)
            )
        ).all()
        if series_ids:
            # Удалить связанные данные перед удалением событий
            session.exec(
                delete(EventParticipant).where(
                    EventParticipant.event_id.in_(series_ids)
                )
            )
            session.exec(
                delete(Notification).where(
                    Notification.event_id.in_(series_ids)
                )
            )
            session.exec(
                delete(EventAttachment).where(
                    EventAttachment.event_id.in_(series_ids)
                )
            )
            session.exec(
                delete(EventComment).where(
                    EventComment.event_id.in_(series_ids)
                )
            )
            session.exec(delete(Event).where(Event.id.in_(series_ids)))
        else:
            # Удалить связанные данные перед удалением события
            session.exec(
                delete(EventParticipant).where(EventParticipant.event_id == event_id)
            )
            session.exec(
                delete(Notification).where(Notification.event_id == event_id)
            )
            session.exec(
                delete(EventAttachment).where(EventAttachment.event_id == event_id)
            )
            session.exec(
                delete(EventComment).where(EventComment.event_id == event_id)
            )
            session.delete(event)
    else:
        # Удалить связанные данные перед удалением события
        session.exec(
            delete(EventParticipant).where(EventParticipant.event_id == event_id)
        )
        session.exec(
            delete(Notification).where(Notification.event_id == event_id)
        )
        session.exec(
            delete(EventAttachment).where(EventAttachment.event_id == event_id)
        )
        session.exec(
            delete(EventComment).where(EventComment.event_id == event_id)
        )
        session.delete(event)

    session.commit()
    
    # Notify participants about cancellation (асинхронно через Celery)
    for participant_id in participant_ids:
        if participant_id != current_user.id:
            notify_event_cancelled_task.delay(
                user_id=str(participant_id),
                event_id=str(event_id),
                canceller_name=canceller_name,
            )
