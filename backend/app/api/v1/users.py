from __future__ import annotations

from datetime import date, datetime
from typing import List
from uuid import UUID

from fastapi import APIRouter, Body, Depends, HTTPException, status
from sqlmodel import select
from app.core.security import get_password_hash

from app.api.deps import get_current_user, is_admin_or_it
from app.db import SessionDep
from app.models import User, UserDepartment, UserOrganization
from app.schemas import UserBase, UserRead, UserUpdate, UserCreate

router = APIRouter()


@router.get("/", response_model=List[UserRead], summary="List users")
def list_users(
    session: SessionDep,
    current_user: User = Depends(get_current_user),
) -> List[UserRead]:
    statement = select(User).order_by(User.created_at.asc())
    users = session.exec(statement).all()
    
    # Load many-to-many relationships
    result = []
    for user in users:
        user_dict = UserRead.model_validate(user).model_dump()
        # Get all departments
        dept_statement = select(UserDepartment.department_id).where(UserDepartment.user_id == user.id)
        user_dict["department_ids"] = [str(did) for did in session.exec(dept_statement).all()]
        # Get all organizations
        org_statement = select(UserOrganization.organization_id).where(UserOrganization.user_id == user.id)
        user_dict["organization_ids"] = [str(oid) for oid in session.exec(org_statement).all()]
        result.append(UserRead(**user_dict))
    
    return result


@router.get("/me", response_model=UserRead, summary="Get current user profile")
def get_current_user_profile(
    session: SessionDep,
    current_user: User = Depends(get_current_user),
) -> UserRead:
    """Get current authenticated user profile."""
    user_dict = UserRead.model_validate(current_user).model_dump()
    # Get all departments
    dept_statement = select(UserDepartment.department_id).where(UserDepartment.user_id == current_user.id)
    dept_ids = session.exec(dept_statement).all()
    user_dict["department_ids"] = [str(did) for did in dept_ids] if dept_ids else []
    # Get all organizations
    org_statement = select(UserOrganization.organization_id).where(UserOrganization.user_id == current_user.id)
    org_ids = session.exec(org_statement).all()
    user_dict["organization_ids"] = [str(oid) for oid in org_ids] if org_ids else []
    return UserRead(**user_dict)


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
    current_user.birthday = payload.birthday
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
    """Update a user by id. Supports partial updates."""
    user = session.get(User, user_id)
    if not user:
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
    if "role" in payload_dict and payload_dict["role"] is not None:
        user.role = payload_dict["role"]
    if "access_org_structure" in payload_dict and payload_dict["access_org_structure"] is not None:
        user.access_org_structure = payload_dict["access_org_structure"]
    if "access_tickets" in payload_dict and payload_dict["access_tickets"] is not None:
        user.access_tickets = payload_dict["access_tickets"]
    if "access_availability_slots" in payload_dict and payload_dict["access_availability_slots"] is not None:
        user.access_availability_slots = payload_dict["access_availability_slots"]
    if "show_local_time" in payload_dict:
        user.show_local_time = payload_dict["show_local_time"]
    if "show_moscow_time" in payload_dict:
        user.show_moscow_time = payload_dict["show_moscow_time"]
    if "birthday" in payload_dict:
        user.birthday = payload_dict["birthday"]
    if "password" in payload_dict and payload_dict["password"] is not None:
        # Only admins and IT can change passwords
        if not is_admin_or_it(current_user, session):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only admins and IT department can change passwords",
            )
        user.hashed_password = get_password_hash(payload_dict["password"])
    
    # Handle many-to-many relationships if provided
    if "department_ids" in payload_dict and payload_dict["department_ids"] is not None:
        # Remove old relationships
        old_depts = session.exec(select(UserDepartment).where(UserDepartment.user_id == user_id)).all()
        for old_dept in old_depts:
            session.delete(old_dept)
        # Add new relationships
        if payload_dict["department_ids"]:
            for dept_id in payload_dict["department_ids"]:
                if dept_id:  # Skip None values
                    try:
                        dept_uuid = UUID(str(dept_id)) if not isinstance(dept_id, UUID) else dept_id
                        user_dept = UserDepartment(user_id=user_id, department_id=dept_uuid)
                        session.add(user_dept)
                    except (ValueError, TypeError) as e:
                        print(f"Invalid department_id: {dept_id}, error: {e}")
    
    if "organization_ids" in payload_dict and payload_dict["organization_ids"] is not None:
        # Remove old relationships
        old_orgs = session.exec(select(UserOrganization).where(UserOrganization.user_id == user_id)).all()
        for old_org in old_orgs:
            session.delete(old_org)
        # Add new relationships
        if payload_dict["organization_ids"]:
            for org_id in payload_dict["organization_ids"]:
                if org_id:  # Skip None values
                    try:
                        org_uuid = UUID(str(org_id)) if not isinstance(org_id, UUID) else org_id
                        user_org = UserOrganization(user_id=user_id, organization_id=org_uuid)
                        session.add(user_org)
                    except (ValueError, TypeError) as e:
                        print(f"Invalid organization_id: {org_id}, error: {e}")
    
    session.add(user)
    session.commit()
    session.refresh(user)
    
    # Return with many-to-many relationships
    user_dict = UserRead.model_validate(user).model_dump()
    dept_statement = select(UserDepartment.department_id).where(UserDepartment.user_id == user_id)
    dept_ids = session.exec(dept_statement).all()
    user_dict["department_ids"] = [str(did) for did in dept_ids] if dept_ids else []
    org_statement = select(UserOrganization.organization_id).where(UserOrganization.user_id == user_id)
    org_ids = session.exec(org_statement).all()
    user_dict["organization_ids"] = [str(oid) for oid in org_ids] if org_ids else []
    return UserRead(**user_dict)


@router.get("/birthdays", response_model=List[UserRead], summary="Get users with birthdays today")
def get_today_birthdays(
    session: SessionDep,
    current_user: User = Depends(get_current_user),
) -> List[UserRead]:
    """Get all users who have birthdays today."""
    today = date.today()
    statement = select(User).where(
        User.birthday.isnot(None),
        User.is_active == True
    )
    users = session.exec(statement).all()
    
    # Filter users with birthdays today
    today_birthdays = []
    for user in users:
        if user.birthday:
            # Compare month and day, ignore year
            if user.birthday.month == today.month and user.birthday.day == today.day:
                user_dict = UserRead.model_validate(user).model_dump()
                # Load many-to-many relationships
                dept_statement = select(UserDepartment.department_id).where(UserDepartment.user_id == user.id)
                dept_ids = session.exec(dept_statement).all()
                user_dict["department_ids"] = [str(did) for did in dept_ids] if dept_ids else []
                org_statement = select(UserOrganization.organization_id).where(UserOrganization.user_id == user.id)
                org_ids = session.exec(org_statement).all()
                user_dict["organization_ids"] = [str(oid) for oid in org_ids] if org_ids else []
                today_birthdays.append(UserRead(**user_dict))
    
    return today_birthdays


@router.post(
    "/bootstrap-admin",
    response_model=UserRead,
    status_code=status.HTTP_201_CREATED,
    summary="Create first admin if none exists (bootstrap)",
)
def bootstrap_admin(
    session: SessionDep,
    payload: UserCreate = Body(...),
) -> UserRead:
    """Создание первого администратора без авторизации, если админов нет."""
    existing_admin = session.exec(
        select(User).where(User.role == "admin").limit(1)
    ).first()
    if existing_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin already exists",
        )

    # Check email uniqueness
    existing_email = session.exec(
        select(User).where(User.email == payload.email.lower())
    ).one_or_none()
    if existing_email:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email is already registered",
        )

    user = User(
        email=payload.email.lower(),
        full_name=payload.full_name,
        phone=payload.phone,
        position=payload.position,
        department=payload.department,
        department_id=payload.department_id,
        manager_id=payload.manager_id,
        organization_id=payload.organization_id,
        avatar_url=payload.avatar_url,
        hashed_password=get_password_hash(payload.password),
        role="admin",
        access_org_structure=payload.access_org_structure,
        access_tickets=payload.access_tickets,
        show_local_time=payload.show_local_time,
        show_moscow_time=payload.show_moscow_time,
        birthday=payload.birthday,
    )
    session.add(user)
    session.commit()
    session.refresh(user)

    # Many-to-many
    if payload.department_ids:
        for dept_id in payload.department_ids:
            if dept_id:
                session.add(UserDepartment(user_id=user.id, department_id=dept_id))
    if payload.organization_ids:
        for org_id in payload.organization_ids:
            if org_id:
                session.add(UserOrganization(user_id=user.id, organization_id=org_id))
    session.commit()

    # Создаем личный календарь для нового пользователя
    try:
        from app.services.personal_calendar import ensure_personal_calendar
        ensure_personal_calendar(session, user.id)
    except Exception as e:
        # Логируем ошибку, но не прерываем создание пользователя
        import logging
        logger = logging.getLogger(__name__)
        logger.warning(f"Не удалось создать личный календарь для пользователя {user.id}: {e}")

    user_dict = UserRead.model_validate(user).model_dump()
    user_dict["department_ids"] = [str(did) for did in payload.department_ids] if payload.department_ids else []
    user_dict["organization_ids"] = [str(oid) for oid in payload.organization_ids] if payload.organization_ids else []
    return UserRead(**user_dict)


@router.post(
    "/admin-create",
    response_model=UserRead,
    status_code=status.HTTP_201_CREATED,
    summary="Create user (admin only)",
)
def admin_create_user(
    session: SessionDep,
    payload: UserCreate = Body(...),
    current_user: User = Depends(get_current_user),
) -> UserRead:
    if not is_admin_or_it(current_user, session):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized"
        )

    # Check email uniqueness
    existing = session.exec(
        select(User).where(User.email == payload.email.lower())
    ).one_or_none()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email is already registered",
        )

    user = User(
        email=payload.email.lower(),
        full_name=payload.full_name,
        phone=payload.phone,
        position=payload.position,
        department=payload.department,
        department_id=payload.department_id,
        manager_id=payload.manager_id,
        organization_id=payload.organization_id,
        avatar_url=payload.avatar_url,
        hashed_password=get_password_hash(payload.password),
        role="employee" if payload.role is None else payload.role,
        access_org_structure=payload.access_org_structure,
        access_tickets=payload.access_tickets,
        access_availability_slots=payload.access_availability_slots,
        show_local_time=payload.show_local_time,
        show_moscow_time=payload.show_moscow_time,
        birthday=payload.birthday,
    )
    session.add(user)
    session.commit()
    session.refresh(user)

    # Add many-to-many relationships if provided
    if payload.department_ids:
        for dept_id in payload.department_ids:
            if dept_id:
                session.add(UserDepartment(user_id=user.id, department_id=dept_id))
    if payload.organization_ids:
        for org_id in payload.organization_ids:
            if org_id:
                session.add(UserOrganization(user_id=user.id, organization_id=org_id))
    session.commit()

    # Создаем личный календарь для нового пользователя
    try:
        from app.services.personal_calendar import ensure_personal_calendar
        ensure_personal_calendar(session, user.id)
    except Exception as e:
        # Логируем ошибку, но не прерываем создание пользователя
        import logging
        logger = logging.getLogger(__name__)
        logger.warning(f"Не удалось создать личный календарь для пользователя {user.id}: {e}")

    # Return with relationships
    user_dict = UserRead.model_validate(user).model_dump()
    user_dict["department_ids"] = [str(did) for did in payload.department_ids] if payload.department_ids else []
    user_dict["organization_ids"] = [str(oid) for oid in payload.organization_ids] if payload.organization_ids else []
    return UserRead(**user_dict)



