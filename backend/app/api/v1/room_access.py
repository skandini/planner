from __future__ import annotations

from typing import List
from uuid import UUID

from fastapi import APIRouter, HTTPException, status
from sqlmodel import select

from app.db import SessionDep
from app.models import Department, Room, RoomAccess, User
from app.schemas.room_access import (
    RoomAccessCreate,
    RoomAccessRead,
    RoomAccessUpdate,
)

router = APIRouter()


@router.get(
    "/rooms/{room_id}/access",
    response_model=List[RoomAccessRead],
    summary="Get room access list",
)
def get_room_access(room_id: UUID, session: SessionDep) -> List[RoomAccess]:
    """Get all access entries for a room."""
    room = session.get(Room, room_id)
    if not room:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Room not found"
        )

    statement = select(RoomAccess).where(RoomAccess.room_id == room_id)
    return session.exec(statement).all()


@router.post(
    "/rooms/{room_id}/access",
    response_model=RoomAccessRead,
    status_code=status.HTTP_201_CREATED,
    summary="Grant room access",
)
def grant_room_access(
    room_id: UUID, payload: RoomAccessCreate, session: SessionDep
) -> RoomAccess:
    """Grant access to a room for a user or department."""
    room = session.get(Room, room_id)
    if not room:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Room not found"
        )

    # Validate that either user_id or department_id is set, but not both
    if not payload.user_id and not payload.department_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Either user_id or department_id must be provided",
        )

    if payload.user_id and payload.department_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot set both user_id and department_id",
        )

    # Validate user exists if provided
    if payload.user_id:
        user = session.get(User, payload.user_id)
        if not user:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="User not found"
            )

    # Validate department exists if provided
    if payload.department_id:
        department = session.get(Department, payload.department_id)
        if not department:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Department not found"
            )

    # Check if access already exists
    if payload.user_id:
        existing = session.exec(
            select(RoomAccess).where(
                RoomAccess.room_id == room_id, RoomAccess.user_id == payload.user_id
            )
        ).first()
    else:
        existing = session.exec(
            select(RoomAccess).where(
                RoomAccess.room_id == room_id,
                RoomAccess.department_id == payload.department_id,
            )
        ).first()

    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Access already granted",
        )

    access = RoomAccess(
        room_id=room_id,
        user_id=payload.user_id,
        department_id=payload.department_id,
    )
    session.add(access)
    session.commit()
    session.refresh(access)
    return access


@router.delete(
    "/rooms/{room_id}/access/{access_id}",
    status_code=status.HTTP_200_OK,
    summary="Revoke room access",
)
def revoke_room_access(
    room_id: UUID, access_id: UUID, session: SessionDep
) -> dict[str, str]:
    """Revoke access to a room."""
    room = session.get(Room, room_id)
    if not room:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Room not found"
        )

    access = session.get(RoomAccess, access_id)
    if not access or access.room_id != room_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Access not found"
        )

    session.delete(access)
    session.commit()
    return {"status": "revoked"}


@router.get(
    "/users/{user_id}/room-access",
    response_model=List[RoomAccessRead],
    summary="Get user's room access",
)
def get_user_room_access(user_id: UUID, session: SessionDep) -> List[RoomAccess]:
    """Get all rooms a user has access to (directly or via department)."""
    user = session.get(User, user_id)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="User not found"
        )

    # Get direct access
    direct_access = session.exec(
        select(RoomAccess).where(RoomAccess.user_id == user_id)
    ).all()

    # Get access via department
    department_access: List[RoomAccess] = []
    if user.department_id:
        department_access = session.exec(
            select(RoomAccess).where(RoomAccess.department_id == user.department_id)
        ).all()

    # Combine and deduplicate by room_id
    all_access = {str(acc.room_id): acc for acc in direct_access}
    for acc in department_access:
        all_access[str(acc.room_id)] = acc

    return list(all_access.values())

