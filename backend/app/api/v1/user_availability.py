from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Body, Depends, HTTPException, status
from sqlmodel import select

from app.api.deps import get_current_user
from app.db import SessionDep
from app.models import User, UserAvailabilitySchedule
from app.schemas.user_availability_schedule import (
    UserAvailabilityScheduleCreate,
    UserAvailabilityScheduleRead,
    UserAvailabilityScheduleUpdate,
)

router = APIRouter()


@router.get("/me/availability", response_model=UserAvailabilityScheduleRead, summary="Get current user availability schedule")
def get_current_user_availability(
    session: SessionDep,
    current_user: User = Depends(get_current_user),
) -> UserAvailabilityScheduleRead:
    """Get current user's availability schedule."""
    statement = select(UserAvailabilitySchedule).where(UserAvailabilitySchedule.user_id == current_user.id)
    schedule = session.exec(statement).first()
    
    if not schedule:
        # Return empty schedule if doesn't exist (will be created on first update)
        from datetime import datetime
        now = datetime.utcnow()
        return UserAvailabilityScheduleRead(
            id=UUID("00000000-0000-0000-0000-000000000000"),
            user_id=current_user.id,
            schedule={},
            timezone="UTC",
            created_at=now,
            updated_at=now,
        )
        session.add(default_schedule)
        session.commit()
        session.refresh(default_schedule)
        return UserAvailabilityScheduleRead.model_validate(default_schedule)
    
    return UserAvailabilityScheduleRead.model_validate(schedule)


@router.put("/me/availability", response_model=UserAvailabilityScheduleRead, summary="Update current user availability schedule")
def update_current_user_availability(
    session: SessionDep,
    current_user: User = Depends(get_current_user),
    payload: UserAvailabilityScheduleUpdate = Body(...),
) -> UserAvailabilityScheduleRead:
    """Update current user's availability schedule."""
    statement = select(UserAvailabilitySchedule).where(UserAvailabilitySchedule.user_id == current_user.id)
    schedule = session.exec(statement).first()
    
    if not schedule:
        # Create new schedule if doesn't exist
        schedule = UserAvailabilitySchedule(
            user_id=current_user.id,
            schedule=payload.schedule if payload.schedule is not None else {},
            timezone=payload.timezone if payload.timezone is not None else "UTC",
        )
        session.add(schedule)
    else:
        # Update existing schedule
        if payload.schedule is not None:
            schedule.schedule = payload.schedule
        if payload.timezone is not None:
            schedule.timezone = payload.timezone
        from datetime import datetime
        schedule.updated_at = datetime.utcnow()  # Update timestamp
    
    session.add(schedule)
    session.commit()
    session.refresh(schedule)
    
    return UserAvailabilityScheduleRead.model_validate(schedule)


@router.get("/{user_id}/availability", response_model=UserAvailabilityScheduleRead, summary="Get user availability schedule")
def get_user_availability(
    user_id: UUID,
    session: SessionDep,
    current_user: User = Depends(get_current_user),
) -> UserAvailabilityScheduleRead:
    """Get user's availability schedule (for checking conflicts)."""
    statement = select(UserAvailabilitySchedule).where(UserAvailabilitySchedule.user_id == user_id)
    schedule = session.exec(statement).first()
    
    if not schedule:
        # Return empty schedule if doesn't exist (user is always available)
        from datetime import datetime
        now = datetime.utcnow()
        return UserAvailabilityScheduleRead(
            id=UUID("00000000-0000-0000-0000-000000000000"),
            user_id=user_id,
            schedule={},
            timezone="UTC",
            created_at=now,
            updated_at=now,
        )
    
    return UserAvailabilityScheduleRead.model_validate(schedule)

