from __future__ import annotations

from typing import List
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlmodel import select, or_

from app.api.deps import get_current_user, is_admin_or_it
from app.db import SessionDep
from app.models import (
    ScheduleAccessPermission,
    User,
    Department,
)

router = APIRouter()


class ScheduleAccessCreate(BaseModel):
    granted_to_user_id: UUID
    target_user_id: UUID | None = None
    target_department_id: UUID | None = None


@router.get(
    "/schedule-access",
    response_model=List[dict],
    summary="Получить список прав доступа к расписанию",
)
def list_schedule_access_permissions(
    session: SessionDep,
    current_user: User = Depends(get_current_user),
) -> List[dict]:
    """
    Получить список всех прав доступа к расписанию.
    Доступно только администраторам и ИТ.
    """
    if not is_admin_or_it(current_user, session):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Доступ запрещен. Требуются права администратора или ИТ.",
        )

    permissions = session.exec(select(ScheduleAccessPermission)).all()
    
    result = []
    for perm in permissions:
        granted_to = session.get(User, perm.granted_to_user_id)
        granted_by = session.get(User, perm.granted_by_user_id)
        target_user = session.get(User, perm.target_user_id) if perm.target_user_id else None
        target_department = session.get(Department, perm.target_department_id) if perm.target_department_id else None
        
        result.append({
            "id": str(perm.id),
            "granted_to_user": {
                "id": str(granted_to.id) if granted_to else None,
                "email": granted_to.email if granted_to else None,
                "full_name": granted_to.full_name if granted_to else None,
            } if granted_to else None,
            "target_user": {
                "id": str(target_user.id) if target_user else None,
                "email": target_user.email if target_user else None,
                "full_name": target_user.full_name if target_user else None,
            } if target_user else None,
            "target_department": {
                "id": str(target_department.id) if target_department else None,
                "name": target_department.name if target_department else None,
            } if target_department else None,
            "granted_by_user": {
                "id": str(granted_by.id) if granted_by else None,
                "email": granted_by.email if granted_by else None,
                "full_name": granted_by.full_name if granted_by else None,
            } if granted_by else None,
            "created_at": perm.created_at.isoformat(),
            "updated_at": perm.updated_at.isoformat(),
        })
    
    return result


@router.post(
    "/schedule-access",
    response_model=dict,
    status_code=status.HTTP_201_CREATED,
    summary="Создать право доступа к расписанию",
)
def create_schedule_access_permission(
    payload: ScheduleAccessCreate,
    session: SessionDep = None,
    current_user: User = Depends(get_current_user),
) -> dict:
    """
    Создать право доступа к расписанию сотрудника или отдела.
    Доступно только администраторам и ИТ.
    
    Должен быть указан либо target_user_id, либо target_department_id.
    """
    if not is_admin_or_it(current_user, session):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Доступ запрещен. Требуются права администратора или ИТ.",
        )

    if not payload.target_user_id and not payload.target_department_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Необходимо указать либо target_user_id, либо target_department_id",
        )

    if payload.target_user_id and payload.target_department_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Нельзя указать одновременно target_user_id и target_department_id",
        )

    # Проверяем, что пользователь существует
    granted_to_user = session.get(User, payload.granted_to_user_id)
    if not granted_to_user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Пользователь не найден",
        )

    # Проверяем, что целевой пользователь или отдел существует
    if payload.target_user_id:
        target_user = session.get(User, payload.target_user_id)
        if not target_user:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Целевой пользователь не найден",
            )
    else:
        target_department = session.get(Department, payload.target_department_id)
        if not target_department:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Отдел не найден",
            )

    # Проверяем, не существует ли уже такое право доступа
    existing = session.exec(
        select(ScheduleAccessPermission).where(
            ScheduleAccessPermission.granted_to_user_id == payload.granted_to_user_id,
            or_(
                ScheduleAccessPermission.target_user_id == payload.target_user_id,
                ScheduleAccessPermission.target_department_id == payload.target_department_id,
            ),
        )
    ).first()

    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Такое право доступа уже существует",
        )

    permission = ScheduleAccessPermission(
        granted_to_user_id=payload.granted_to_user_id,
        target_user_id=payload.target_user_id,
        target_department_id=payload.target_department_id,
        granted_by_user_id=current_user.id,
    )
    session.add(permission)
    session.commit()
    session.refresh(permission)

    return {
        "id": str(permission.id),
        "granted_to_user_id": str(permission.granted_to_user_id),
        "target_user_id": str(permission.target_user_id) if permission.target_user_id else None,
        "target_department_id": str(permission.target_department_id) if permission.target_department_id else None,
        "granted_by_user_id": str(permission.granted_by_user_id),
        "created_at": permission.created_at.isoformat(),
        "updated_at": permission.updated_at.isoformat(),
    }


@router.delete(
    "/schedule-access/{permission_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Удалить право доступа к расписанию",
    response_model=None,
)
def delete_schedule_access_permission(
    permission_id: UUID,
    session: SessionDep = None,
    current_user: User = Depends(get_current_user),
) -> None:
    """
    Удалить право доступа к расписанию.
    Доступно только администраторам и ИТ.
    """
    if not is_admin_or_it(current_user, session):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Доступ запрещен. Требуются права администратора или ИТ.",
        )

    permission = session.get(ScheduleAccessPermission, permission_id)
    if not permission:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Право доступа не найдено",
        )

    session.delete(permission)
    session.commit()


@router.get(
    "/schedule-access/check/{target_user_id}",
    response_model=dict,
    summary="Проверить, есть ли у текущего пользователя доступ к расписанию",
)
def check_schedule_access(
    target_user_id: UUID,
    session: SessionDep = None,
    current_user: User = Depends(get_current_user),
) -> dict:
    """
    Проверить, есть ли у текущего пользователя доступ к расписанию указанного пользователя.
    Доступ есть, если:
    1. Пользователь сам просматривает свое расписание
    2. Есть прямое право доступа к этому пользователю
    3. Есть право доступа к отделу, к которому принадлежит пользователь
    4. Пользователь является администратором или ИТ
    """
    # Администраторы и ИТ имеют доступ ко всем расписаниям
    if is_admin_or_it(current_user, session):
        return {"has_access": True, "reason": "admin_or_it"}

    # Пользователь всегда может просматривать свое расписание
    if current_user.id == target_user_id:
        return {"has_access": True, "reason": "self"}

    target_user = session.get(User, target_user_id)
    if not target_user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Пользователь не найден",
        )

    # Проверяем прямое право доступа к пользователю
    direct_permission = session.exec(
        select(ScheduleAccessPermission).where(
            ScheduleAccessPermission.granted_to_user_id == current_user.id,
            ScheduleAccessPermission.target_user_id == target_user_id,
        )
    ).first()

    if direct_permission:
        return {"has_access": True, "reason": "direct_permission"}

    # Проверяем право доступа через отдел
    if target_user.department_id:
        department_permission = session.exec(
            select(ScheduleAccessPermission).where(
                ScheduleAccessPermission.granted_to_user_id == current_user.id,
                ScheduleAccessPermission.target_department_id == target_user.department_id,
            )
        ).first()

        if department_permission:
            return {"has_access": True, "reason": "department_permission"}

    return {"has_access": False, "reason": "no_permission"}

