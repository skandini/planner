from __future__ import annotations

from datetime import datetime
from typing import List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlmodel import select

from app.api.deps import get_current_user
from app.db import SessionDep
from app.models import AvailabilitySlot, Calendar, Event, User
from app.schemas.availability_slot import (
    AvailabilitySlotCreate,
    AvailabilitySlotRead,
    AvailabilitySlotUpdate,
    AvailabilitySlotWithUser,
    BookSlotRequest,
)
from app.schemas.event import EventCreate

router = APIRouter()


@router.post(
    "/",
    response_model=AvailabilitySlotRead,
    summary="Create availability slot",
    status_code=status.HTTP_201_CREATED,
)
def create_availability_slot(
    payload: AvailabilitySlotCreate,
    session: SessionDep,
    current_user: User = Depends(get_current_user),
) -> AvailabilitySlotRead:
    """Create a new availability slot."""
    # Validate that ends_at is after starts_at
    if payload.ends_at <= payload.starts_at:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="ends_at must be after starts_at",
        )
    
    # Create the slot
    slot = AvailabilitySlot(
        user_id=current_user.id,
        process_name=payload.process_name,
        starts_at=payload.starts_at,
        ends_at=payload.ends_at,
        description=payload.description,
        status="available",
    )
    session.add(slot)
    session.commit()
    session.refresh(slot)
    
    return AvailabilitySlotRead.model_validate(slot)


@router.get(
    "/",
    response_model=List[AvailabilitySlotWithUser],
    summary="List availability slots",
)
def list_availability_slots(
    session: SessionDep,
    current_user: User = Depends(get_current_user),
    process_name: Optional[str] = Query(default=None, description="Filter by process name"),
    status_filter: Optional[str] = Query(default=None, alias="status", description="Filter by status (available, booked, cancelled). If not provided, returns all slots."),
    from_date: Optional[datetime] = Query(default=None, alias="from", description="Filter slots starting from this date"),
    to_date: Optional[datetime] = Query(default=None, alias="to", description="Filter slots ending before this date"),
    my_slots_only: bool = Query(default=False, description="Show only my slots"),
) -> List[AvailabilitySlotWithUser]:
    """List availability slots."""
    stmt = select(AvailabilitySlot, User).join(User, AvailabilitySlot.user_id == User.id)
    
    # Apply filters
    if my_slots_only:
        stmt = stmt.where(AvailabilitySlot.user_id == current_user.id)
    
    if process_name:
        stmt = stmt.where(AvailabilitySlot.process_name.ilike(f"%{process_name}%"))
    
    if status_filter:
        stmt = stmt.where(AvailabilitySlot.status == status_filter)
    
    if from_date:
        stmt = stmt.where(AvailabilitySlot.ends_at >= from_date)
    
    if to_date:
        stmt = stmt.where(AvailabilitySlot.starts_at <= to_date)
    
    # Order by starts_at
    stmt = stmt.order_by(AvailabilitySlot.starts_at)
    
    rows = session.exec(stmt).all()
    
    result = []
    for slot, user in rows:
        # Get user's department
        department_name = None
        if user.department_id:
            from app.models import Department
            dept = session.get(Department, user.department_id)
            if dept:
                department_name = dept.name
        
        # Get booked_by user information if exists
        booked_by_user_name = None
        booked_by_user_email = None
        if slot.booked_by:
            booked_by_user = session.get(User, slot.booked_by)
            if booked_by_user:
                booked_by_user_name = booked_by_user.full_name if booked_by_user.full_name and str(booked_by_user.id) not in (booked_by_user.full_name or "") else None
                booked_by_user_email = booked_by_user.email
        
        result.append(
            AvailabilitySlotWithUser(
                id=slot.id,
                user_id=slot.user_id,
                process_name=slot.process_name,
                starts_at=slot.starts_at,
                ends_at=slot.ends_at,
                description=slot.description,
                status=slot.status,
                booked_by=slot.booked_by,
                booked_at=slot.booked_at,
                event_id=slot.event_id,
                created_at=slot.created_at,
                updated_at=slot.updated_at,
                user_name=user.full_name if user.full_name and str(user.id) not in (user.full_name or "") else None,
                user_email=user.email,
                user_department=department_name,
                booked_by_user_name=booked_by_user_name,
                booked_by_user_email=booked_by_user_email,
            )
        )
    
    return result


@router.get(
    "/{slot_id}",
    response_model=AvailabilitySlotWithUser,
    summary="Get availability slot by ID",
)
def get_availability_slot(
    slot_id: UUID,
    session: SessionDep,
    current_user: User = Depends(get_current_user),
) -> AvailabilitySlotWithUser:
    """Get availability slot by ID."""
    stmt = select(AvailabilitySlot, User).join(User, AvailabilitySlot.user_id == User.id).where(
        AvailabilitySlot.id == slot_id
    )
    row = session.exec(stmt).first()
    
    if not row:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Availability slot not found",
        )
    
    slot, user = row
    
    # Get user's department
    department_name = None
    if user.department_id:
        from app.models import Department
        dept = session.get(Department, user.department_id)
        if dept:
            department_name = dept.name
    
    return AvailabilitySlotWithUser(
        id=slot.id,
        user_id=slot.user_id,
        process_name=slot.process_name,
        starts_at=slot.starts_at,
        ends_at=slot.ends_at,
        description=slot.description,
        status=slot.status,
        booked_by=slot.booked_by,
        booked_at=slot.booked_at,
        event_id=slot.event_id,
        created_at=slot.created_at,
        updated_at=slot.updated_at,
        user_name=user.full_name,
        user_email=user.email,
        user_department=department_name,
    )


@router.put(
    "/{slot_id}",
    response_model=AvailabilitySlotRead,
    summary="Update availability slot",
)
def update_availability_slot(
    slot_id: UUID,
    payload: AvailabilitySlotUpdate,
    session: SessionDep,
    current_user: User = Depends(get_current_user),
) -> AvailabilitySlotRead:
    """Update availability slot."""
    slot = session.get(AvailabilitySlot, slot_id)
    if not slot:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Availability slot not found",
        )
    
    # Only the owner can update the slot
    if slot.user_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You can only update your own availability slots",
        )
    
    # Cannot update booked slots
    if slot.status == "booked":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot update a booked slot",
        )
    
    # Update fields
    if payload.process_name is not None:
        slot.process_name = payload.process_name
    if payload.starts_at is not None:
        slot.starts_at = payload.starts_at
    if payload.ends_at is not None:
        slot.ends_at = payload.ends_at
    if payload.description is not None:
        slot.description = payload.description
    if payload.status is not None:
        slot.status = payload.status
    
    # Validate that ends_at is after starts_at
    if slot.ends_at <= slot.starts_at:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="ends_at must be after starts_at",
        )
    
    session.add(slot)
    session.commit()
    session.refresh(slot)
    
    return AvailabilitySlotRead.model_validate(slot)


@router.delete(
    "/{slot_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete availability slot",
    response_model=None,
)
def delete_availability_slot(
    slot_id: UUID,
    session: SessionDep,
    current_user: User = Depends(get_current_user),
) -> None:
    """Delete availability slot."""
    slot = session.get(AvailabilitySlot, slot_id)
    if not slot:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Availability slot not found",
        )
    
    # Only the owner can delete the slot
    if slot.user_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You can only delete your own availability slots",
        )
    
    # Cannot delete booked slots
    if slot.status == "booked":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot delete a booked slot",
        )
    
    session.delete(slot)
    session.commit()


@router.post(
    "/{slot_id}/book",
    response_model=AvailabilitySlotRead,
    summary="Book availability slot",
)
def book_availability_slot(
    slot_id: UUID,
    payload: BookSlotRequest,
    session: SessionDep,
    current_user: User = Depends(get_current_user),
) -> AvailabilitySlotRead:
    """Book an availability slot and create an event."""
    slot = session.get(AvailabilitySlot, slot_id)
    if not slot:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Availability slot not found",
        )
    
    # Check if slot is available
    if slot.status != "available":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Slot is not available for booking",
        )
    
    # Cannot book own slot
    if slot.user_id == current_user.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="You cannot book your own availability slot",
        )
    
    # Verify calendar exists and user has access
    calendar = session.get(Calendar, payload.calendar_id)
    if not calendar:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Calendar not found",
        )
    
    # Check calendar access
    from app.models import CalendarMember
    member = session.exec(
        select(CalendarMember).where(
            CalendarMember.calendar_id == payload.calendar_id,
            CalendarMember.user_id == current_user.id,
        )
    ).first()
    
    if not member and calendar.owner_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You don't have access to this calendar",
        )
    
    # Create the event
    from app.api.v1.events import _attach_participants, _ensure_no_conflicts
    
    # Add participants: slot owner and current user (booker)
    participant_ids = [slot.user_id, current_user.id]
    if payload.participant_ids:
        participant_ids.extend(payload.participant_ids)
    
    # Remove duplicates
    participant_ids = list(set(participant_ids))
    
    # Check for conflicts before creating event (ensures unified busy status)
    # Skip availability check for current user (booker) - they explicitly want to book this slot
    _ensure_no_conflicts(
        session,
        calendar_id=payload.calendar_id,
        starts_at=slot.starts_at,
        ends_at=slot.ends_at,
        room_id=payload.room_id,
        participant_ids=participant_ids,
        skip_availability_check_for=[current_user.id],
    )
    
    event = Event(
        calendar_id=payload.calendar_id,
        title=payload.title,
        description=payload.description,
        starts_at=slot.starts_at,
        ends_at=slot.ends_at,
        all_day=False,
        status="confirmed",
        timezone="UTC",
    )
    session.add(event)
    session.flush()
    
    _attach_participants(session, event.id, participant_ids)
    
    # Update slot status
    slot.status = "booked"
    slot.booked_by = current_user.id
    slot.booked_at = datetime.utcnow()
    slot.event_id = event.id
    
    session.add(slot)
    session.commit()
    session.refresh(slot)
    
    return AvailabilitySlotRead.model_validate(slot)


@router.get(
    "/processes/list",
    response_model=List[str],
    summary="List all unique process names",
)
def list_process_names(
    session: SessionDep,
    current_user: User = Depends(get_current_user),
) -> List[str]:
    """List all unique process names from availability slots."""
    stmt = select(AvailabilitySlot.process_name).distinct().where(
        AvailabilitySlot.status == "available"
    ).order_by(AvailabilitySlot.process_name)
    
    process_names = session.exec(stmt).all()
    return list(process_names)

