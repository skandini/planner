from __future__ import annotations

from datetime import datetime
from typing import List
from uuid import UUID, uuid5, NAMESPACE_URL

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select as sql_select
from sqlmodel import and_, or_, select

from app.api.deps import get_current_user
from app.db import SessionDep
from app.models import Calendar, CalendarMember, Event, EventParticipant, Room, User, UserAvailabilitySchedule
from app.schemas import (
    CalendarCreate,
    CalendarMemberCreate,
    CalendarMemberRead,
    CalendarMemberUpdate,
    CalendarReadWithRole,
    CalendarUpdate,
    ConflictEntry,
    EventRead,
)
from app.services.permissions import (
    add_calendar_member,
    calendar_access_condition,
    ensure_calendar_access,
    get_user_calendar_role,
)

router = APIRouter()


def _serialize_calendar_with_role(
    calendar: Calendar,
    *,
    role: str | None,
) -> CalendarReadWithRole:
    base = CalendarReadWithRole.model_validate(calendar)
    return base.model_copy(update={"current_user_role": role})


@router.get(
    "/",
    response_model=List[CalendarReadWithRole],
    summary="List calendars",
)
def list_calendars(
    session: SessionDep,
    current_user: User = Depends(get_current_user),
) -> List[CalendarReadWithRole]:
    # Показываем календари пользователя, фильтруя по его организации
    # Если у пользователя есть organization_id, показываем только календари этой организации
    # Если organization_id нет, показываем все календари пользователя
    conditions = [Calendar.owner_id == current_user.id]
    
    if current_user.organization_id:
        # Фильтруем по организации пользователя
        conditions.append(
            or_(
                Calendar.organization_id == current_user.organization_id,
                Calendar.organization_id.is_(None)  # Также показываем календари без организации
            )
        )
    
    statement = (
        select(Calendar)
        .where(and_(*conditions))
        .order_by(Calendar.created_at.desc())
    )
    calendars = session.exec(statement).all()

    result: List[CalendarReadWithRole] = []
    for calendar in calendars:
        # Все календари, которые видит пользователь, являются его собственными
        result.append(_serialize_calendar_with_role(calendar, role="owner"))

    return result


@router.post(
    "/",
    response_model=CalendarReadWithRole,
    status_code=status.HTTP_201_CREATED,
    summary="Create calendar",
)
def create_calendar(
    payload: CalendarCreate,
    session: SessionDep,
    current_user: User = Depends(get_current_user),
) -> CalendarReadWithRole:
    # При создании календаря автоматически устанавливаем organization_id пользователя
    calendar_data = payload.model_dump()
    if current_user.organization_id:
        calendar_data["organization_id"] = current_user.organization_id
    calendar = Calendar(**calendar_data, owner_id=current_user.id)
    session.add(calendar)
    session.commit()
    session.refresh(calendar)

    add_calendar_member(
        session,
        calendar_id=calendar.id,
        user_id=current_user.id,
        role="owner",
    )
    session.commit()
    return _serialize_calendar_with_role(calendar, role="owner")


@router.get(
    "/{calendar_id}",
    response_model=CalendarReadWithRole,
    summary="Get calendar by id",
)
def get_calendar(
    calendar_id: UUID,
    session: SessionDep,
    current_user: User = Depends(get_current_user),
) -> CalendarReadWithRole:
    calendar = ensure_calendar_access(session, calendar_id, current_user)
    role = get_user_calendar_role(session, calendar, current_user)
    return _serialize_calendar_with_role(calendar, role=role)


@router.put(
    "/{calendar_id}",
    response_model=CalendarReadWithRole,
    summary="Update calendar",
)
def update_calendar(
    calendar_id: UUID,
    payload: CalendarUpdate,
    session: SessionDep,
    current_user: User = Depends(get_current_user),
) -> Calendar:
    calendar = ensure_calendar_access(session, calendar_id, current_user)

    update_data = payload.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(calendar, field, value)
    calendar.touch()

    session.add(calendar)
    session.commit()
    session.refresh(calendar)
    role = get_user_calendar_role(session, calendar, current_user)
    return _serialize_calendar_with_role(calendar, role=role)


@router.delete(
    "/{calendar_id}",
    status_code=status.HTTP_200_OK,
    summary="Delete calendar",
)
def delete_calendar(
    calendar_id: UUID,
    session: SessionDep,
    current_user: User = Depends(get_current_user),
) -> dict[str, str]:
    calendar = ensure_calendar_access(session, calendar_id, current_user)

    session.delete(calendar)
    session.commit()
    return {"status": "deleted"}


@router.get(
    "/{calendar_id}/members",
    response_model=List[CalendarMemberRead],
    summary="List calendar members",
)
def list_calendar_members(
    calendar_id: UUID,
    session: SessionDep,
    current_user: User = Depends(get_current_user),
) -> List[CalendarMemberRead]:
    ensure_calendar_access(session, calendar_id, current_user)

    query = (
        select(CalendarMember, User)
        .join(User, User.id == CalendarMember.user_id)
        .where(CalendarMember.calendar_id == calendar_id)
        .order_by(CalendarMember.added_at)
    )
    rows = session.exec(query).all()

    members: List[CalendarMemberRead] = []
    for member, user in rows:
        members.append(
            CalendarMemberRead(
                calendar_id=calendar_id,
                user_id=user.id,
                role=member.role,
                added_at=member.added_at,
                email=user.email,
                full_name=user.full_name,
            )
        )
    return members


@router.post(
    "/{calendar_id}/members",
    response_model=CalendarMemberRead,
    status_code=status.HTTP_201_CREATED,
    summary="Add calendar member",
)
def create_calendar_member(
    calendar_id: UUID,
    payload: CalendarMemberCreate,
    session: SessionDep,
    current_user: User = Depends(get_current_user),
) -> CalendarMemberRead:
    # Editor и owner могут добавлять участников в календарь
    ensure_calendar_access(session, calendar_id, current_user, required_role="editor")

    target_user = session.get(User, payload.user_id)
    if not target_user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="User not found"
        )

    add_calendar_member(
        session,
        calendar_id=calendar_id,
        user_id=payload.user_id,
        role=payload.role,
    )
    session.commit()

    membership = session.exec(
        select(CalendarMember).where(
            CalendarMember.calendar_id == calendar_id,
            CalendarMember.user_id == payload.user_id,
        )
    ).one()

    return CalendarMemberRead(
        calendar_id=calendar_id,
        user_id=payload.user_id,
        role=membership.role,
        added_at=membership.added_at,
        email=target_user.email,
        full_name=target_user.full_name,
    )


@router.patch(
    "/{calendar_id}/members/{user_id}",
    response_model=CalendarMemberRead,
    summary="Update calendar member role",
)
def update_calendar_member(
    calendar_id: UUID,
    user_id: UUID,
    payload: CalendarMemberUpdate,
    session: SessionDep,
    current_user: User = Depends(get_current_user),
) -> CalendarMemberRead:
    """Update calendar member role (only owner can do this)."""
    ensure_calendar_access(session, calendar_id, current_user, required_role="owner")
    
    # Нельзя изменить роль владельца календаря
    calendar = session.get(Calendar, calendar_id)
    if calendar and calendar.owner_id == user_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot change owner role"
        )
    
    membership = session.exec(
        select(CalendarMember).where(
            CalendarMember.calendar_id == calendar_id,
            CalendarMember.user_id == user_id,
        )
    ).one_or_none()
    
    if not membership:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Calendar member not found"
        )
    
    membership.role = payload.role
    session.add(membership)
    session.commit()
    session.refresh(membership)
    
    target_user = session.get(User, user_id)
    if not target_user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
    
    return CalendarMemberRead(
        calendar_id=calendar_id,
        user_id=user_id,
        role=membership.role,
        added_at=membership.added_at,
        email=target_user.email,
        full_name=target_user.full_name,
    )


@router.delete(
    "/{calendar_id}/members/{user_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Remove calendar member",
    response_model=None,
)
def delete_calendar_member(
    calendar_id: UUID,
    user_id: UUID,
    session: SessionDep,
    current_user: User = Depends(get_current_user),
) -> None:
    """Remove calendar member (only owner can do this)."""
    ensure_calendar_access(session, calendar_id, current_user, required_role="owner")
    
    # Нельзя удалить владельца календаря
    calendar = session.get(Calendar, calendar_id)
    if calendar and calendar.owner_id == user_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot remove calendar owner"
        )
    
    membership = session.exec(
        select(CalendarMember).where(
            CalendarMember.calendar_id == calendar_id,
            CalendarMember.user_id == user_id,
        )
    ).one_or_none()
    
    if not membership:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Calendar member not found"
        )
    
    session.delete(membership)
    session.commit()


def _generate_unavailability_events(
    user_id: UUID,
    schedule: dict,
    timezone: str,
    from_date: datetime,
    to_date: datetime,
) -> List[EventRead]:
    """Generate virtual events for unavailable time slots based on user's availability schedule."""
    from datetime import timedelta, time as dt_time
    from datetime import timezone as dt_timezone
    
    if not schedule:
        return []
    
    # Normalize datetime objects - remove timezone info for comparison
    if from_date.tzinfo:
        from_date = from_date.replace(tzinfo=None)
    if to_date.tzinfo:
        to_date = to_date.replace(tzinfo=None)
    
    # Ensure schedule is a dict
    if not isinstance(schedule, dict):
        return []
    
    # Для работы с московским временем (UTC+3)
    # Schedule times указаны в московском времени, нам нужно правильно создать события
    tz_offset = 0  # Default to UTC
    if timezone == "Europe/Moscow":
        tz_offset = 3  # UTC+3
    elif timezone == "Europe/Kiev":
        tz_offset = 2  # UTC+2
    elif timezone == "Asia/Almaty":
        tz_offset = 6  # UTC+6
    
    # Создаем timezone-aware datetime объекты для правильной работы с часовыми поясами
    # Используем timezone offset для создания datetime в нужном часовом поясе
    moscow_tz = dt_timezone(timedelta(hours=tz_offset))
    
    # Day names mapping
    day_names = {
        0: "monday",
        1: "tuesday",
        2: "wednesday",
        3: "thursday",
        4: "friday",
        5: "saturday",
        6: "sunday",
    }
    
    # Helper function to generate unique UUID for virtual events based on datetime
    def generate_unavailability_id(starts_at: datetime, ends_at: datetime, user_id: UUID, is_available: bool = False) -> UUID:
        """Generate a deterministic UUID for a virtual availability/unavailability event."""
        prefix = "available" if is_available else "unavailable"
        unique_string = f"{prefix}-{user_id}-{starts_at.isoformat()}-{ends_at.isoformat()}"
        return uuid5(NAMESPACE_URL, unique_string)
    
    unavailability_events = []
    try:
        # Конвертируем даты в московское время для правильного определения дня недели
        # Если timezone = "Europe/Moscow", добавляем 3 часа к UTC
        moscow_offset = timedelta(hours=tz_offset)
        from_date_moscow = from_date + moscow_offset
        to_date_moscow = to_date + moscow_offset
        current_date = from_date_moscow.date()
        end_date = to_date_moscow.date()
    except (AttributeError, ValueError):
        return []
    
    # Iterate through each day in the range
    while current_date <= end_date:
        # Используем дату в московском времени для определения дня недели
        weekday = current_date.weekday()
        day_name = day_names[weekday]
        
        # Get availability slots for this day
        day_slots = schedule.get(day_name, [])
        
        if not day_slots:
            # If no slots defined, user is unavailable all day
            # Создаем datetime в московском времени для этого дня, затем конвертируем в UTC
            day_start_moscow = datetime.combine(current_date, dt_time(0, 0), moscow_tz)
            day_end_moscow = datetime.combine(current_date, dt_time(23, 59, 59), moscow_tz)
            # Конвертируем в UTC (наивный datetime для совместимости с базой данных)
            day_start_utc = day_start_moscow.astimezone(dt_timezone.utc).replace(tzinfo=None)
            day_end_utc = day_end_moscow.astimezone(dt_timezone.utc).replace(tzinfo=None)
            
            if day_start_utc < to_date and day_end_utc > from_date:
                now = datetime.utcnow()
                unavailability_events.append(EventRead(
                    id=generate_unavailability_id(day_start_utc, day_end_utc, user_id),
                    calendar_id=UUID("00000000-0000-0000-0000-000000000000"),
                    title="Недоступен по расписанию",
                    description="Пользователь недоступен в это время согласно настройкам доступности",
                    starts_at=day_start_utc,
                    ends_at=day_end_utc,
                    all_day=False,
                    status="unavailable",
                    timezone=timezone,
                    created_at=now,
                    updated_at=now,
                ))
        else:
            # User has availability slots - find gaps between slots and before/after
            # Sort slots by start time
            sorted_slots = sorted(day_slots, key=lambda x: x.get("start", "00:00"))
            
            # Also create availability events for the slots themselves (with labels)
            for slot in sorted_slots:
                try:
                    slot_start = slot.get("start", "00:00")
                    slot_end = slot.get("end", "23:59")
                    slot_label = slot.get("label")  # Get label if exists
                    
                    if not isinstance(slot_start, str) or not isinstance(slot_end, str):
                        continue
                    
                    start_hour, start_minute = map(int, slot_start.split(":"))
                    end_hour, end_minute = map(int, slot_end.split(":"))
                    
                    # Создаем datetime в московском времени для этого слота, затем конвертируем в UTC
                    slot_start_moscow = datetime.combine(current_date, dt_time(start_hour, start_minute), moscow_tz)
                    slot_end_moscow = datetime.combine(current_date, dt_time(end_hour, end_minute), moscow_tz)
                    # Конвертируем в UTC (наивный datetime для совместимости с базой данных)
                    slot_start_utc = slot_start_moscow.astimezone(dt_timezone.utc).replace(tzinfo=None)
                    slot_end_utc = slot_end_moscow.astimezone(dt_timezone.utc).replace(tzinfo=None)
                    
                    if slot_start_utc < to_date and slot_end_utc > from_date:
                        now = datetime.utcnow()
                        # Create availability event (not unavailability) with label
                        # Если есть label, используем его как title, иначе "Доступен"
                        title = slot_label if slot_label and slot_label.strip() else "Доступен"
                        # description всегда содержит label, если он есть
                        description = slot_label if slot_label and slot_label.strip() else "Пользователь доступен в это время"
                        unavailability_events.append(EventRead(
                            id=generate_unavailability_id(slot_start_utc, slot_end_utc, user_id, is_available=True),
                            calendar_id=UUID("00000000-0000-0000-0000-000000000000"),
                            title=title,
                            description=description,
                            starts_at=slot_start_utc,
                            ends_at=slot_end_utc,
                            all_day=False,
                            status="available",  # Mark as available (not unavailable)
                            timezone=timezone,
                            created_at=now,
                            updated_at=now,
                        ))
                except (ValueError, TypeError, AttributeError):
                    continue
            
            # Check time before first slot
            if sorted_slots:
                first_slot_start = sorted_slots[0].get("start", "00:00")
                hour, minute = map(int, first_slot_start.split(":"))
                if hour > 0 or minute > 0:
                    # Создаем datetime в московском времени, затем конвертируем в UTC
                    day_start_moscow = datetime.combine(current_date, dt_time(0, 0), moscow_tz)
                    first_slot_moscow = datetime.combine(current_date, dt_time(hour, minute), moscow_tz)
                    day_start_utc = day_start_moscow.astimezone(dt_timezone.utc).replace(tzinfo=None)
                    first_slot_utc = first_slot_moscow.astimezone(dt_timezone.utc).replace(tzinfo=None)
                    
                    if day_start_utc < to_date and first_slot_utc > from_date:
                        now = datetime.utcnow()
                        unavailability_events.append(EventRead(
                            id=generate_unavailability_id(day_start_utc, first_slot_utc, user_id),
                            calendar_id=UUID("00000000-0000-0000-0000-000000000000"),
                            title="Недоступен по расписанию",
                            description="Пользователь недоступен в это время согласно настройкам доступности",
                            starts_at=day_start_utc,
                            ends_at=first_slot_utc,
                            all_day=False,
                            status="unavailable",
                            timezone=timezone,
                            created_at=now,
                            updated_at=now,
                        ))
                
                # Check gaps between slots
                for i in range(len(sorted_slots) - 1):
                    try:
                        current_slot_end = sorted_slots[i].get("end", "23:59")
                        next_slot_start = sorted_slots[i + 1].get("start", "23:59")
                        
                        if not isinstance(current_slot_end, str) or not isinstance(next_slot_start, str):
                            continue
                        
                        end_hour, end_minute = map(int, current_slot_end.split(":"))
                        start_hour, start_minute = map(int, next_slot_start.split(":"))
                        
                        # Создаем datetime в московском времени, затем конвертируем в UTC
                        gap_end_moscow = datetime.combine(current_date, dt_time(end_hour, end_minute), moscow_tz)
                        gap_start_moscow = datetime.combine(current_date, dt_time(start_hour, start_minute), moscow_tz)
                        gap_end_utc = gap_end_moscow.astimezone(dt_timezone.utc).replace(tzinfo=None)
                        gap_start_utc = gap_start_moscow.astimezone(dt_timezone.utc).replace(tzinfo=None)
                        
                        if gap_end_utc < gap_start_utc and gap_end_utc < to_date and gap_start_utc > from_date:
                            now = datetime.utcnow()
                            unavailability_events.append(EventRead(
                                id=generate_unavailability_id(gap_end_utc, gap_start_utc, user_id),
                                calendar_id=UUID("00000000-0000-0000-0000-000000000000"),
                                title="Недоступен по расписанию",
                                description="Пользователь недоступен в это время согласно настройкам доступности",
                                starts_at=gap_end_utc,
                                ends_at=gap_start_utc,
                                all_day=False,
                                status="unavailable",
                                timezone=timezone,
                                created_at=now,
                                updated_at=now,
                            ))
                    except (ValueError, TypeError, AttributeError):
                        continue
                
                # Check time after last slot
                try:
                    last_slot_end = sorted_slots[-1].get("end", "23:59")
                    if isinstance(last_slot_end, str):
                        end_hour, end_minute = map(int, last_slot_end.split(":"))
                        if end_hour < 23 or end_minute < 59:
                            # Создаем datetime в московском времени, затем конвертируем в UTC
                            last_slot_moscow = datetime.combine(current_date, dt_time(end_hour, end_minute), moscow_tz)
                            day_end_moscow = datetime.combine(current_date, dt_time(23, 59, 59), moscow_tz)
                            last_slot_utc = last_slot_moscow.astimezone(dt_timezone.utc).replace(tzinfo=None)
                            day_end_utc = day_end_moscow.astimezone(dt_timezone.utc).replace(tzinfo=None)
                            
                            if last_slot_utc < to_date and day_end_utc > from_date:
                                now = datetime.utcnow()
                                unavailability_events.append(EventRead(
                                    id=generate_unavailability_id(last_slot_utc, day_end_utc, user_id),
                                    calendar_id=UUID("00000000-0000-0000-0000-000000000000"),
                                    title="Недоступен по расписанию",
                                    description="Пользователь недоступен в это время согласно настройкам доступности",
                                    starts_at=last_slot_utc,
                                    ends_at=day_end_utc,
                                    all_day=False,
                                    status="unavailable",
                                    timezone=timezone,
                                    created_at=now,
                                    updated_at=now,
                                ))
                except (ValueError, TypeError, AttributeError):
                    pass
        
        try:
            # Переходим к следующему дню в московском времени
            # Создаем datetime в московском времени, добавляем день, затем получаем date
            current_date_moscow_dt = datetime.combine(current_date, dt_time(0, 0), moscow_tz)
            next_day_moscow = current_date_moscow_dt + timedelta(days=1)
            current_date = next_day_moscow.date()
        except (ValueError, TypeError):
            break
    
    return unavailability_events


@router.get(
    "/{calendar_id}/members/{user_id}/availability",
    response_model=List[EventRead],
    summary="Get user availability for a date range",
)
def get_user_availability(
    calendar_id: UUID,
    user_id: UUID,
    session: SessionDep,
    current_user: User = Depends(get_current_user),
    from_date: datetime = Query(..., alias="from", description="Start date (ISO format)"),
    to_date: datetime = Query(..., alias="to", description="End date (ISO format)"),
) -> List[EventRead]:
    # Упрощенная логика: проверяем только, что календарь существует
    # Любой пользователь может проверить доступность любого другого пользователя
    # Это позволяет приглашать участников без проверки доступа к календарю
    calendar = session.get(Calendar, calendar_id)
    if not calendar:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Calendar not found",
        )

    # Получаем ВСЕ события пользователя в указанном диапазоне
    # Включаем:
    # 1. События, где пользователь является участником (через EventParticipant)
    # 2. События из личных календарей пользователя
    # Это единая занятость для всех календарей
    from app.models import EventParticipant

    # События, где пользователь является участником
    participant_events_subquery = select(EventParticipant.event_id).where(
        EventParticipant.user_id == user_id
    )

    # Личные календари пользователя
    personal_calendars_subquery = select(Calendar.id).where(
        Calendar.owner_id == user_id
    )

    # Получаем все события:
    # 1. Где пользователь является участником
    # 2. Из личных календарей пользователя
    # Это дает полную занятость независимо от календаря
    try:
        stmt = (
            select(Event)
            .where(
                and_(
                    or_(
                        Event.id.in_(participant_events_subquery),
                        Event.calendar_id.in_(personal_calendars_subquery),
                    ),
                    Event.starts_at < to_date,
                    Event.ends_at > from_date,
                )
            )
            .order_by(Event.starts_at)
        )
        events = session.exec(stmt).all()

        # Сериализуем события с участниками
        from app.api.v1.events import _serialize_event_with_participants
        real_events = [_serialize_event_with_participants(session, event) for event in events]
        
        # Get user's availability schedule
        schedule_stmt = select(UserAvailabilitySchedule).where(
            UserAvailabilitySchedule.user_id == user_id
        )
        availability_schedule = session.exec(schedule_stmt).first()
        
        # Generate unavailability events based on schedule
        if availability_schedule and availability_schedule.schedule:
            unavailability_events = _generate_unavailability_events(
                user_id=user_id,
                schedule=availability_schedule.schedule,
                timezone=availability_schedule.timezone,
                from_date=from_date,
                to_date=to_date,
            )
            # Combine real events with unavailability events
            return real_events + unavailability_events
        
        return real_events
    except Exception as e:
        # Логируем ошибку для отладки
        import traceback
        print(f"[ERROR] get_user_availability failed: {str(e)}")
        print(traceback.format_exc())
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get user availability: {str(e)}"
        )


def _build_conflict_entry(
    *,
    conflict_type: str,
    resource_id: UUID | None,
    resource_label: str,
    slot_start: datetime,
    slot_end: datetime,
    events: list[dict],
) -> ConflictEntry:
    return ConflictEntry(
        type=conflict_type,  # type: ignore[arg-type]
        resource_id=resource_id,
        resource_label=resource_label,
        slot_start=slot_start,
        slot_end=slot_end,
        events=[
            {
                "id": e["id"],
                "title": e["title"],
                "starts_at": e["starts_at"],
                "ends_at": e["ends_at"],
                "room_id": e["room_id"],
            }
            for e in events
        ],
    )


def _detect_overlaps(events: list[dict]) -> list[tuple[datetime, datetime, list[dict]]]:
    overlaps: list[tuple[datetime, datetime, list[dict]]] = []
    sorted_events = sorted(events, key=lambda e: e["starts_at"])
    for i in range(len(sorted_events)):
        current = sorted_events[i]
        for j in range(i + 1, len(sorted_events)):
            candidate = sorted_events[j]
            if candidate["starts_at"] >= current["ends_at"]:
                break
            slot_start = max(current["starts_at"], candidate["starts_at"])
            slot_end = min(current["ends_at"], candidate["ends_at"])
            overlaps.append((slot_start, slot_end, [current, candidate]))
    return overlaps


@router.get(
    "/{calendar_id}/conflicts",
    response_model=List[ConflictEntry],
    summary="List conflicts within a range",
)
def get_conflicts(
    calendar_id: UUID,
    session: SessionDep,
    current_user: User = Depends(get_current_user),
    from_date: datetime = Query(..., alias="from", description="Start date (ISO format)"),
    to_date: datetime = Query(..., alias="to", description="End date (ISO format)"),
) -> List[ConflictEntry]:
    ensure_calendar_access(session, calendar_id, current_user)

    events_stmt = (
        select(Event)
        .where(Event.calendar_id == calendar_id)
        .where(Event.starts_at < to_date)
        .where(Event.ends_at > from_date)
    )
    events = session.exec(events_stmt).all()
    if not events:
        return []

    event_ids = [event.id for event in events]
    room_ids = {event.room_id for event in events if event.room_id is not None}

    room_labels: dict[UUID, str] = {}
    if room_ids:
        room_rows = session.exec(select(Room).where(Room.id.in_(room_ids))).all()
        room_labels = {room.id: room.name for room in room_rows}

    participants_by_event: dict[UUID, list[dict]] = {event_id: [] for event_id in event_ids}
    if event_ids:
        participant_rows = session.exec(
            sql_select(EventParticipant, User)
            .join(User, User.id == EventParticipant.user_id)
            .where(EventParticipant.event_id.in_(event_ids))
        ).all()
        for participant, user in participant_rows:
            participants_by_event[participant.event_id].append(
                {
                    "user_id": user.id,
                    "label": user.full_name or user.email,
                }
            )

    event_payloads: list[dict] = []
    for event in events:
        event_payloads.append(
            {
                "id": event.id,
                "title": event.title,
                "starts_at": event.starts_at,
                "ends_at": event.ends_at,
                "room_id": event.room_id,
                "room_label": room_labels.get(event.room_id) if event.room_id else None,
                "participants": participants_by_event.get(event.id, []),
            }
        )

    conflicts: list[ConflictEntry] = []

    # Room conflicts
    rooms_map: dict[UUID, list[dict]] = {}
    for payload in event_payloads:
        room_id = payload["room_id"]
        if not room_id:
            continue
        rooms_map.setdefault(room_id, []).append(payload)

    for room_id, items in rooms_map.items():
        overlaps = _detect_overlaps(items)
        for slot_start, slot_end, overlap_events in overlaps:
            conflicts.append(
                _build_conflict_entry(
                    conflict_type="room",
                    resource_id=room_id,
                    resource_label=room_labels.get(room_id, "Переговорка"),
                    slot_start=slot_start,
                    slot_end=slot_end,
                    events=overlap_events,
                )
            )

    # Participant conflicts
    events_by_user: dict[UUID, list[dict]] = {}
    for payload in event_payloads:
        for participant in payload["participants"]:
            events_by_user.setdefault(participant["user_id"], []).append(
                {**payload, "participant_label": participant["label"]}
            )

    for user_id, items in events_by_user.items():
        overlaps = _detect_overlaps(items)
        for slot_start, slot_end, overlap_events in overlaps:
            conflicts.append(
                _build_conflict_entry(
                    conflict_type="participant",
                    resource_id=user_id,
                    resource_label=items[0]["participant_label"],
                    slot_start=slot_start,
                    slot_end=slot_end,
                    events=overlap_events,
                )
            )

    return conflicts

