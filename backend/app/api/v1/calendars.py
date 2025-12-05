from __future__ import annotations

from datetime import datetime
from typing import List
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import and_, select as sql_select
from sqlmodel import select

from app.api.deps import get_current_user
from app.db import SessionDep
from app.models import Calendar, CalendarMember, Event, EventParticipant, Room, User
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
    statement = (
        select(Calendar)
        .where(calendar_access_condition(current_user.id))
        .order_by(Calendar.created_at.desc())
    )
    calendars = session.exec(statement).all()

    membership_map = {
        member.calendar_id: member.role
        for member in session.exec(
            select(CalendarMember).where(CalendarMember.user_id == current_user.id)
        )
    }

    result: List[CalendarReadWithRole] = []
    for calendar in calendars:
        role = (
            "owner"
            if calendar.owner_id == current_user.id
            else membership_map.get(calendar.id)
        )
        result.append(_serialize_calendar_with_role(calendar, role=role))

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
    calendar = Calendar(**payload.model_dump(), owner_id=current_user.id)
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
    ensure_calendar_access(session, calendar_id, current_user)

    # Проверяем, что пользователь является участником календаря
    member = session.exec(
        select(CalendarMember).where(
            CalendarMember.calendar_id == calendar_id,
            CalendarMember.user_id == user_id,
        )
    ).one_or_none()
    calendar = session.get(Calendar, calendar_id)
    if not member and calendar.owner_id != user_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User is not a member of this calendar",
        )

    # Получаем события пользователя в указанном диапазоне
    from app.models import EventParticipant

    stmt = (
        sql_select(Event)
        .join(EventParticipant, Event.id == EventParticipant.event_id)
        .where(
            and_(
                EventParticipant.user_id == user_id,
                Event.starts_at < to_date,
                Event.ends_at > from_date,
            )
        )
        .order_by(Event.starts_at)
    )
    events = session.exec(stmt).scalars().all()

    # Сериализуем события с участниками
    from app.api.v1.events import _serialize_event_with_participants

    return [_serialize_event_with_participants(session, event) for event in events]


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

