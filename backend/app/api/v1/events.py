from __future__ import annotations

from calendar import monthrange
from datetime import datetime, timedelta
from typing import List, Literal, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlmodel import and_, delete, or_, select

from app.api.deps import get_current_user
from app.db import SessionDep
from app.models import Calendar, Event, EventParticipant, User
from app.schemas import (
    EventCreate,
    EventRead,
    EventParticipantRead,
    EventUpdate,
    ParticipantStatusUpdate,
    RecurrenceRule,
)
from app.services.notifications import (
    notify_event_cancelled,
    notify_event_invited,
    notify_event_updated,
    notify_participant_response,
    schedule_reminders_for_event,
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
    month_index = base.month - 1 + months
    year = base.year + month_index // 12
    month = month_index % 12 + 1
    day = min(base.day, monthrange(year, month)[1])
    return base.replace(year=year, month=month, day=day)


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


def _serialize_event_with_participants(
    session: SessionDep, event: Event
) -> EventRead:
    participants = _load_event_participants(session, event.id)
    return EventRead.model_validate(event).model_copy(update={"participants": participants})


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

    statement = select(Event).where(
        or_(
            Event.calendar_id.in_(personal_calendars_subquery),
            Event.id.in_(participant_events_subquery)
        )
    )
    if filter_expr is not None:
        statement = statement.where(filter_expr)
    statement = statement.order_by(Event.starts_at)
    events = session.exec(statement).all()
    return [_serialize_event_with_participants(session, event) for event in events]


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

    # Create notifications for participants
    if participant_ids:
        inviter_name = current_user.full_name or current_user.email
        notified_count = 0
        for participant_id in participant_ids:
            if participant_id != current_user.id:  # Don't notify yourself
                notify_event_invited(
                    session=session,
                    user_id=participant_id,
                    event=event,
                    inviter_name=inviter_name,
                )
                notified_count += 1

    # Schedule reminders
    schedule_reminders_for_event(session, event)

    session.commit()
    session.refresh(event)

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
            new_start = target.starts_at + delta
            new_end = target.ends_at + delta
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
    if "starts_at" in data and data["starts_at"].tzinfo:
        data["starts_at"] = data["starts_at"].replace(tzinfo=None)
    if "ends_at" in data and data["ends_at"].tzinfo:
        data["ends_at"] = data["ends_at"].replace(tzinfo=None)
    new_starts_at = data.get("starts_at", event.starts_at)
    new_ends_at = data.get("ends_at", event.ends_at)
    new_room_id = data.get("room_id", event.room_id)

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

    for field, value in data.items():
        setattr(event, field, value)
    event.touch()

    session.add(event)
    
    # Notify participants about update
    participant_ids = _get_event_participant_ids(session, event_id)
    updater_name = current_user.full_name or current_user.email
    for participant_id in participant_ids:
        if participant_id != current_user.id:  # Don't notify yourself
            notify_event_updated(
                session=session,
                user_id=participant_id,
                event=event,
                updater_name=updater_name,
            )
    
    session.commit()

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
            # Отправляем уведомление новым участникам
            if user_id != current_user.id:
                notify_event_invited(
                    session=session,
                    user_id=user_id,
                    event=event,
                    inviter_name=updater_name,
                )
        
        # Сохраняем статусы ответов существующих участников
        for user_id in existing_user_ids & new_participant_ids_set:
            existing_participant = existing_participants_map[user_id]
            if existing_participant.response_status in ("accepted", "declined", "tentative"):
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

    # Уведомляем организатора события об изменении статуса участника
    calendar = session.get(Calendar, event.calendar_id)
    if calendar and calendar.owner_id:
        if calendar.owner_id != current_user.id:
            notify_participant_response(
                session=session,
                user_id=calendar.owner_id,
                event=event,
                participant_name=current_user.full_name or current_user.email,
                old_status=old_status,
                new_status=payload.response_status,
            )

    session.refresh(event)
    return _serialize_event_with_participants(session, event)


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
            # Notify participants
            for participant_id in participant_ids:
                if participant_id != current_user.id:
                    notify_event_cancelled(
                        session=session,
                        user_id=participant_id,
                        event=event,
                        canceller_name=canceller_name,
                    )
            session.exec(
                delete(EventParticipant).where(
                    EventParticipant.event_id.in_(series_ids)
                )
            )
            session.exec(delete(Event).where(Event.id.in_(series_ids)))
        else:
            session.delete(event)
    else:
        # Notify participants
        for participant_id in participant_ids:
            if participant_id != current_user.id:
                notify_event_cancelled(
                    session=session,
                    user_id=participant_id,
                    event=event,
                    canceller_name=canceller_name,
                )
        session.exec(
            delete(EventParticipant).where(EventParticipant.event_id == event_id)
        )
        session.delete(event)

    session.commit()
