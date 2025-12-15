from __future__ import annotations

from uuid import UUID

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlmodel import select

from app.core.config import settings
from app.core.security import verify_token
from app.db import SessionDep
from app.models import User, UserDepartment, Department

oauth2_scheme = OAuth2PasswordBearer(tokenUrl=f"{settings.API_V1_STR}/auth/login")


def get_current_user(
    session: SessionDep,
    token: str = Depends(oauth2_scheme),
) -> User:
    try:
        payload = verify_token(token, token_type="access")
        user_id = payload.get("sub")
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials",
            headers={"WWW-Authenticate": "Bearer"},
        ) from None

    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication payload",
            headers={"WWW-Authenticate": "Bearer"},
        )

    statement = select(User).where(User.id == UUID(user_id))
    user = session.exec(statement).one_or_none()
    if not user or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Inactive or missing user",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return user


def is_admin_or_it(user: User, session: SessionDep) -> bool:
    """
    Check if user has admin rights:
    - User has role "admin", OR
    - User belongs to a department with "ИТ" or "IT" in its name (case-insensitive)
    """
    # Check if user is admin
    if user.role == "admin":
        return True
    
    # Check if user belongs to IT department
    # Get all departments user belongs to
    dept_ids = session.exec(
        select(UserDepartment.department_id).where(UserDepartment.user_id == user.id)
    ).all()
    
    if not dept_ids:
        return False
    
    # Check if any department name contains "ИТ" or "IT"
    for dept_id in dept_ids:
        dept = session.get(Department, dept_id)
        if dept and dept.name:
            dept_name_lower = dept.name.lower()
            if "ит" in dept_name_lower or "it" in dept_name_lower:
                return True
    
    return False

