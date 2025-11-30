from __future__ import annotations

from datetime import datetime
from typing import List
from uuid import UUID

from fastapi import APIRouter, HTTPException, Query, status
from sqlmodel import select

from app.db import SessionDep
from app.models import Event, Room
from app.schemas import EventRead, RoomCreate, RoomRead, RoomUpdate

router = APIRouter()


@router.get("/", response_model=List[RoomRead], summary="List rooms")
def list_rooms(session: SessionDep) -> List[Room]:
    statement = select(Room).where(Room.is_active == True).order_by(Room.name)
    return session.exec(statement).all()


@router.post(
    "/",
    response_model=RoomRead,
    status_code=status.HTTP_201_CREATED,
    summary="Create room",
)
def create_room(payload: RoomCreate, session: SessionDep) -> Room:
    room = Room(**payload.model_dump())
    session.add(room)
    session.commit()
    session.refresh(room)
    return room


@router.get(
    "/{room_id}",
    response_model=RoomRead,
    summary="Get room by id",
)
def get_room(room_id: UUID, session: SessionDep) -> Room:
    room = session.get(Room, room_id)
    if not room:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Room not found"
        )
    return room


@router.get(
    "/{room_id}/availability",
    response_model=List[EventRead],
    summary="Get room availability for a date",
)
def get_room_availability(
    room_id: UUID,
    date: datetime = Query(..., description="Date to check availability (ISO format)"),
    session: SessionDep = ...,
) -> List[Event]:
    """Get all events booked for a room on a specific date."""
    room = session.get(Room, room_id)
    if not room:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Room not found"
        )

    # Get start and end of the day
    day_start = date.replace(hour=0, minute=0, second=0, microsecond=0)
    day_end = date.replace(hour=23, minute=59, second=59, microsecond=999999)

    statement = (
        select(Event)
        .where(Event.room_id == room_id)
        .where(Event.starts_at < day_end)
        .where(Event.ends_at > day_start)
        .order_by(Event.starts_at)
    )
    return session.exec(statement).all()


@router.put(
    "/{room_id}",
    response_model=RoomRead,
    summary="Update room",
)
def update_room(room_id: UUID, payload: RoomUpdate, session: SessionDep) -> Room:
    room = session.get(Room, room_id)
    if not room:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Room not found"
        )

    update_data = payload.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(room, field, value)
    room.touch()

    session.add(room)
    session.commit()
    session.refresh(room)
    return room


@router.delete(
    "/{room_id}",
    status_code=status.HTTP_200_OK,
    summary="Delete room",
)
def delete_room(room_id: UUID, session: SessionDep) -> dict[str, str]:
    room = session.get(Room, room_id)
    if not room:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Room not found"
        )

    session.delete(room)
    session.commit()
    return {"status": "deleted"}

