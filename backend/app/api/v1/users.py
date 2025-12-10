from __future__ import annotations

from typing import List
from uuid import UUID

from fastapi import APIRouter, Body, Depends, HTTPException, status
from sqlmodel import select

from app.api.deps import get_current_user
from app.db import SessionDep
from app.models import User
from app.schemas import UserBase, UserRead, UserUpdate

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
    current_user.phone = payload.phone
    current_user.position = payload.position
    current_user.department = payload.department  # Legacy field
    current_user.department_id = payload.department_id
    current_user.manager_id = payload.manager_id
    current_user.organization_id = payload.organization_id
    # Не перетираем аватар, если поле не передано
    if payload.avatar_url is not None:
        current_user.avatar_url = payload.avatar_url
    # Настройки проекта
    current_user.show_local_time = payload.show_local_time
    current_user.show_moscow_time = payload.show_moscow_time
    session.add(current_user)
    session.commit()
    session.refresh(current_user)
    return UserRead.model_validate(current_user)


@router.put("/{user_id}", response_model=UserRead, summary="Update user by id")
def update_user(
    user_id: UUID,
    session: SessionDep,
    current_user: User = Depends(get_current_user),
    payload: UserUpdate = Body(...),
) -> UserRead:
    """Update a user by id (admin function). Supports partial updates."""
    # For now, allow any authenticated user to update others
    # In production, you might want to add role-based access control
    user = session.get(User, user_id)
    if not user:
        from fastapi import HTTPException, status
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )
    
    # Update only provided fields (partial update)
    payload_dict = payload.model_dump(exclude_unset=True)
    
    if "email" in payload_dict and payload_dict["email"] is not None:
        user.email = payload_dict["email"].lower()
    if "full_name" in payload_dict:
        user.full_name = payload_dict["full_name"]
    if "phone" in payload_dict:
        user.phone = payload_dict["phone"]
    if "position" in payload_dict:
        user.position = payload_dict["position"]
    if "department" in payload_dict:
        user.department = payload_dict["department"]  # Legacy field
    if "department_id" in payload_dict:
        user.department_id = payload_dict["department_id"]
    if "manager_id" in payload_dict:
        user.manager_id = payload_dict["manager_id"]
    if "organization_id" in payload_dict:
        user.organization_id = payload_dict["organization_id"]
    if "avatar_url" in payload_dict and payload_dict["avatar_url"] is not None:
        user.avatar_url = payload_dict["avatar_url"]
    if "show_local_time" in payload_dict:
        user.show_local_time = payload_dict["show_local_time"]
    if "show_moscow_time" in payload_dict:
        user.show_moscow_time = payload_dict["show_moscow_time"]
    
    session.add(user)
    session.commit()
    session.refresh(user)
    return UserRead.model_validate(user)



