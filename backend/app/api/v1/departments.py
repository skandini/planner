from __future__ import annotations

from typing import List
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import Response
from sqlmodel import select

from app.api.deps import get_current_user, is_admin_or_it
from app.db import SessionDep
from app.models import Department, Organization, User
from app.schemas import (
    DepartmentCreate,
    DepartmentRead,
    DepartmentReadWithChildren,
    DepartmentUpdate,
)

router = APIRouter()


def _serialize_department_with_children(
    department: Department,
    *,
    session: SessionDep,
    all_departments: List[Department],
    all_users: List[User],
) -> DepartmentReadWithChildren:
    """Serialize department with children and employee count."""
    # Count employees in this department
    employee_count = len([u for u in all_users if u.department_id == department.id])
    
    # Get manager name
    manager_name = None
    if department.manager_id:
        manager = next((u for u in all_users if u.id == department.manager_id), None)
        if manager:
            manager_name = manager.full_name or manager.email
    
    # Get children - ПРОСТОЕ И НАДЕЖНОЕ РЕШЕНИЕ: сравниваем UUID как строки
    children = []
    dept_id_str = str(department.id)
    for child in all_departments:
        if child.parent_id is not None:
            child_parent_str = str(child.parent_id)
            if child_parent_str == dept_id_str:
                children.append(
                    _serialize_department_with_children(
                        child, 
                        session=session, 
                        all_departments=all_departments, 
                        all_users=all_users
                    )
                )
    
    base = DepartmentRead.model_validate(department)
    return DepartmentReadWithChildren(
        **base.model_dump(),
        children=children,
        employee_count=employee_count,
        manager_name=manager_name,
    )


@router.get(
    "/",
    response_model=List[DepartmentReadWithChildren],
    summary="List departments",
)
def list_departments(
    session: SessionDep,
    organization_id: UUID | None = None,
    current_user: User = Depends(get_current_user),
) -> List[DepartmentReadWithChildren]:
    """Get all departments, optionally filtered by organization."""
    # Проверка прав доступа к оргструктуре
    if not current_user.access_org_structure:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access to organizational structure denied",
        )
    
    # Принудительно обновляем сессию, чтобы увидеть все изменения
    session.expire_all()
    
    statement = select(Department)
    if organization_id:
        statement = statement.where(Department.organization_id == organization_id)
    
    departments = session.exec(statement).all()
    users = session.exec(select(User)).all()
    
    # Get root departments (no parent) - ПРОСТОЕ РЕШЕНИЕ
    root_departments = [d for d in departments if d.parent_id is None]
    
    # Сериализуем все корневые отделы со всеми детьми рекурсивно
    result = [
        _serialize_department_with_children(
            dept, session=session, all_departments=departments, all_users=users
        )
        for dept in root_departments
    ]
    
    return result


@router.post(
    "/",
    response_model=DepartmentRead,
    status_code=status.HTTP_201_CREATED,
    summary="Create department",
)
def create_department(
    payload: DepartmentCreate,
    session: SessionDep,
    current_user: User = Depends(get_current_user),
) -> DepartmentRead:
    """Create a new department."""
    # Проверка прав доступа - только админы и ИТ могут создавать отделы
    if not is_admin_or_it(current_user, session):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only admins and IT department can create departments",
        )
    
    # Validate parent exists if provided
    if payload.parent_id:
        parent = session.get(Department, payload.parent_id)
        if not parent:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Parent department not found",
            )
    
    # Validate manager exists if provided
    if payload.manager_id:
        manager = session.get(User, payload.manager_id)
        if not manager:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Manager not found",
            )
    
    # Validate organization exists if provided
    if payload.organization_id:
        org = session.get(Organization, payload.organization_id)
        if not org:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Organization not found",
            )
    
    department = Department(**payload.model_dump())
    session.add(department)
    session.commit()
    session.refresh(department)
    
    return DepartmentRead.model_validate(department)


@router.get(
    "/{department_id}",
    response_model=DepartmentReadWithChildren,
    summary="Get department by id",
)
def get_department(
    department_id: UUID,
    session: SessionDep,
    current_user: User = Depends(get_current_user),
) -> DepartmentReadWithChildren:
    """Get a department by id."""
    # Проверка прав доступа к оргструктуре
    if not current_user.access_org_structure:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access to organizational structure denied",
        )
    
    department = session.get(Department, department_id)
    if not department:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Department not found",
        )
    
    departments = session.exec(select(Department)).all()
    users = session.exec(select(User)).all()
    
    return _serialize_department_with_children(
        department, session=session, all_departments=departments, all_users=users
    )


@router.put(
    "/{department_id}",
    response_model=DepartmentRead,
    summary="Update department",
)
def update_department(
    department_id: UUID,
    payload: DepartmentUpdate,
    session: SessionDep,
    current_user: User = Depends(get_current_user),
) -> DepartmentRead:
    """Update a department."""
    # Проверка прав доступа - только админы и ИТ могут изменять отделы
    if not is_admin_or_it(current_user, session):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only admins and IT department can update departments",
        )
    
    department = session.get(Department, department_id)
    if not department:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Department not found",
        )
    
    # Prevent circular references
    if payload.parent_id == department_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Department cannot be its own parent",
        )
    
    # Validate parent exists if provided
    if payload.parent_id:
        parent = session.get(Department, payload.parent_id)
        if not parent:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Parent department not found",
            )
    
    # Validate manager exists if provided
    if payload.manager_id:
        manager = session.get(User, payload.manager_id)
        if not manager:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Manager not found",
            )
    
    update_data = payload.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(department, field, value)
    department.touch()
    
    session.add(department)
    session.commit()
    session.refresh(department)
    return DepartmentRead.model_validate(department)


@router.delete(
    "/{department_id}",
    summary="Delete department",
)
def delete_department(
    department_id: UUID,
    session: SessionDep,
    current_user: User = Depends(get_current_user),
) -> Response:
    """Delete a department. Каскадно удаляет подотделы."""
    # Проверка прав доступа - только админы и ИТ могут удалять отделы
    if not is_admin_or_it(current_user, session):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only admins and IT department can delete departments",
        )
    
    department = session.get(Department, department_id)
    if not department:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Department not found",
        )

    # Каскадно удаляем подотделы
    def delete_children(dept_id: UUID):
        children = session.exec(select(Department).where(Department.parent_id == dept_id)).all()
        for child in children:
            delete_children(child.id)
            session.delete(child)

    delete_children(department_id)
    session.delete(department)
    session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


