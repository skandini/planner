from __future__ import annotations

from typing import List

from fastapi import APIRouter, Depends
from sqlmodel import select

from app.api.deps import get_current_user
from app.db import SessionDep
from app.models import User
from app.schemas import UserRead

router = APIRouter()


@router.get("/", response_model=List[UserRead], summary="List users")
def list_users(
    session: SessionDep,
    current_user: User = Depends(get_current_user),
) -> List[UserRead]:
    statement = select(User).order_by(User.created_at.asc())
    return session.exec(statement).all()


@router.get("/me", response_model=UserRead, summary="Get current user profile")
def get_current_user_profile(
    current_user: User = Depends(get_current_user),
) -> UserRead:
    """Get current authenticated user profile."""
    return UserRead.model_validate(current_user)


@router.put("/me", response_model=UserRead, summary="Update current user profile")
def update_current_user_profile(
    session: SessionDep,
    current_user: User = Depends(get_current_user),
    payload: UserBase = Body(...),
) -> UserRead:
    """Update current authenticated user profile."""
    current_user.email = payload.email.lower()
    current_user.full_name = payload.full_name
    current_user.organization_id = payload.organization_id
    session.add(current_user)
    session.commit()
    session.refresh(current_user)
    return UserRead.model_validate(current_user)



