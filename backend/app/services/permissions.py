from __future__ import annotations

from typing import Iterable
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import or_, select
from sqlmodel import Session

from app.models import Calendar, CalendarMember, User


def calendar_access_condition(user_id: UUID):
    member_subquery = (
        select(CalendarMember.calendar_id).where(CalendarMember.user_id == user_id)
    )
    return or_(Calendar.owner_id == user_id, Calendar.id.in_(member_subquery))


def ensure_calendar_access(
    session: Session,
    calendar_id: UUID,
    user: User,
    required_role: str | None = None,
) -> Calendar:
    calendar = session.get(Calendar, calendar_id)
    if not calendar:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Calendar not found"
        )
    
    user_role = get_user_calendar_role(session, calendar, user)
    if user_role is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Access to calendar denied"
        )
    
    if required_role:
        role_hierarchy = {"viewer": 1, "editor": 2, "owner": 3}
        user_level = role_hierarchy.get(user_role, 0)
        required_level = role_hierarchy.get(required_role, 0)
        if user_level < required_level:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Required role: {required_role}, but user has: {user_role}",
            )
    
    return calendar


def get_user_calendar_role(
    session: Session,
    calendar: Calendar,
    user: User,
) -> str | None:
    if calendar.owner_id == user.id:
        return "owner"

    membership = session.exec(
        select(CalendarMember).where(
            CalendarMember.calendar_id == calendar.id,
            CalendarMember.user_id == user.id,
        )
    ).one_or_none()
    return membership.role if membership else None


def add_calendar_member(
    session: Session,
    *,
    calendar_id: UUID,
    user_id: UUID,
    role: str = "viewer",
) -> None:
    existing = session.exec(
        select(CalendarMember).where(
            CalendarMember.calendar_id == calendar_id,
            CalendarMember.user_id == user_id,
        )
    ).one_or_none()
    if existing:
        return

    membership = CalendarMember(
        calendar_id=calendar_id,
        user_id=user_id,
        role=role,
    )
    session.add(membership)

