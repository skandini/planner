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
    schedule_reminders_for_event,
)
from app.services.permissions import calendar_access_condition, ensure_calendar_access

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
            response_status=p.response_status,
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
    if rule.frequency == "weekly":
        return start + timedelta(weeks=rule.interval)
    if rule.frequency == "monthly":
        return _add_months(start, rule.interval)
    raise HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail="Поддерживаются только daily/weekly/monthly повторения",
    )


def _generate_recurrence_starts(
    start: datetime, rule: RecurrenceRule
) -> List[datetime]:
    additional: List[datetime] = []
    max_extra = (
        max(rule.count - 1, 0) if rule.count is not None else MAX_RECURRENCE_OCCURRENCES
    )
    max_extra = min(max_extra, MAX_RECURRENCE_OCCURRENCES)

    current = start.replace(tzinfo=None) if start.tzinfo else start
    until = rule.until.replace(tzinfo=None) if rule.until else None

    while len(additional) < max_extra:
        current = _advance_recurrence(current, rule)
        if until and current > until:
            break
        additional.append(current)
        if not rule.count and until is None and len(additional) >= MAX_RECURRENCE_OCCURRENCES:
            break

    return additional


def _attach_participants(
    session: SessionDep, event_id: UUID, participant_ids: List[UUID]
) -> None:
    for user_id in participant_ids:
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
        participant_conflict = session.exec(
            select(Event, User)
            .join(EventParticipant, EventParticipant.event_id == Event.id)
            .join(User, User.id == EventParticipant.user_id)
            .where(EventParticipant.user_id.in_(participant_ids), *filters)
        ).first()
        if participant_conflict:
            conflict_event, conflict_user = participant_conflict
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
    if calendar_id:
        ensure_calendar_access(session, calendar_id, current_user)

    filter_expr = _build_range_filter(
        calendar_id=calendar_id, starts_after=starts_after, ends_before=ends_before
    )

    accessible_calendars_subquery = select(Calendar.id).where(
        calendar_access_condition(current_user.id)
    )

    # Также включаем события, где пользователь является участником, даже без доступа к календарю
    participant_events_subquery = select(EventParticipant.event_id).where(
        EventParticipant.user_id == current_user.id
    )

    statement = select(Event).where(
        or_(
            Event.calendar_id.in_(accessible_calendars_subquery),
            Event.id.in_(participant_events_subquery)
        )
    )
    if filter_expr is not None:
        statement = statement.where(filter_expr)
    statement = statement.order_by(Event.starts_at)
    events = session.exec(statement).all()
    return [_serialize_event_with_participants(session, event) for event in events]


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
    ensure_calendar_access(session, payload.calendar_id, current_user)

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
        for participant_id in participant_ids:
            if participant_id != current_user.id:  # Don't notify yourself
                notify_event_invited(
                    session=session,
                    user_id=participant_id,
                    event=event,
                    inviter_name=inviter_name,
                )
        # Schedule reminders
        schedule_reminders_for_event(session=session, event=event)

    session.commit()
    session.refresh(event)

    return _serialize_event_with_participants(session, event)


@router.get("/{event_id}", response_model=EventRead, summary="Get event by id")
def get_event(
    event_id: UUID,
    session: SessionDep,
    current_user: User = Depends(get_current_user),
) -> EventRead:
    try:
        event = session.get(Event, event_id)
        if not event:
            raise HTTPException(status_code=404, detail="Event not found")
        
        # Проверяем доступ: либо доступ к календарю, либо участник события
        try:
            ensure_calendar_access(session, event.calendar_id, current_user)
        except HTTPException:
            # Если нет доступа к календарю, проверяем, является ли пользователь участником события
            participant = session.exec(
                select(EventParticipant).where(
                    EventParticipant.event_id == event_id,
                    EventParticipant.user_id == current_user.id,
                )
            ).one_or_none()
            if not participant:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Access to calendar denied"
                )
        
        return _serialize_event_with_participants(session, event)
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        error_msg = f"Error getting event {event_id}: {str(e)}"
        print(f"[ERROR] {error_msg}")
        print(traceback.format_exc())
        raise HTTPException(
            status_code=500,
            detail=error_msg
        )


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

    ensure_calendar_access(session, event.calendar_id, current_user)

    update_payload = payload.model_dump(exclude_unset=True)
    if "recurrence_rule" in update_payload:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Редактирование повторяющихся событий пока не поддерживается",
        )

    if scope == "series" and not (
        event.recurrence_parent_id or event.recurrence_rule
    ):
        scope = "single"

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
        
        # Удаляем участников, которых больше нет в списке
        for ep in existing:
            if ep.user_id not in new_participant_ids_set:
                session.delete(ep)
        
        # Добавляем новых участников и создаем уведомления
        # Сохраняем статусы существующих участников
        for user_id in new_participant_ids:
            if user_id not in existing_user_ids:
                # Новый участник - создаем с needs_action
                participant = EventParticipant(
                    event_id=event.id, user_id=user_id, response_status="needs_action"
                )
                session.add(participant)
                # Создаем уведомления только для новых участников
                if user_id != current_user.id:
                    inviter_name = current_user.full_name or current_user.email
                    notify_event_invited(
                        session=session,
                        user_id=user_id,
                        event=event,
                        inviter_name=inviter_name,
                    )
            # Существующие участники остаются с их текущими статусами
        session.commit()

    session.refresh(event)
    return _serialize_event_with_participants(session, event)


@router.delete(
    "/{event_id}", status_code=204, summary="Delete event", response_model=None
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

    ensure_calendar_access(session, event.calendar_id, current_user)

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
            delete(EventParticipant).where(EventParticipant.event_id == event.id)
        )
        session.delete(event)

    session.commit()


@router.patch(
    "/{event_id}/participants/{user_id}",
    status_code=status.HTTP_200_OK,
    response_model=EventParticipantRead,
)
def update_participant_status(
    event_id: UUID,
    user_id: UUID,
    data: ParticipantStatusUpdate,
    session: SessionDep,
    current_user: User = Depends(get_current_user),
) -> EventParticipantRead:
    """Update participant response status."""
    event = session.get(Event, event_id)
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")

    # Проверяем, что пользователь обновляет свой собственный статус
    if user_id != current_user.id:
        # Если обновляет чужой статус, нужен доступ к календарю
        ensure_calendar_access(session, event.calendar_id, current_user)
    else:
        # Если обновляет свой статус, проверяем, что он является участником
        participant_check = session.exec(
            select(EventParticipant).where(
                and_(
                    EventParticipant.event_id == event_id,
                    EventParticipant.user_id == current_user.id,
                )
            )
        ).first()
        if not participant_check:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You are not a participant of this event"
            )

    participant = session.exec(
        select(EventParticipant).where(
            and_(
                EventParticipant.event_id == event_id,
                EventParticipant.user_id == user_id,
            )
        )
    ).first()

    if not participant:
        raise HTTPException(status_code=404, detail="Participant not found")

    participant.response_status = data.response_status
    session.add(participant)
    session.commit()
    session.refresh(participant)

    user = session.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    return EventParticipantRead(
        user_id=participant.user_id,
        email=user.email,
        full_name=user.full_name,
        response_status=participant.response_status,
    )

