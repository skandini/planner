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


