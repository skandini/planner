"""
Сервис для управления личными календарями пользователей.
Каждый пользователь автоматически получает личный календарь при регистрации.
"""
from __future__ import annotations

from uuid import UUID

from sqlmodel import Session, select

from app.models import Calendar, User


def ensure_personal_calendar(session: Session, user_id: UUID) -> Calendar:
    """
    Создает или возвращает личный календарь пользователя.
    Личный календарь создается автоматически при регистрации.
    """
    # Проверяем, есть ли уже личный календарь у пользователя
    existing_calendar = session.exec(
        select(Calendar).where(
            Calendar.owner_id == user_id,
            Calendar.name == f"Личный календарь",
        )
    ).first()

    if existing_calendar:
        return existing_calendar

    # Получаем пользователя для имени календаря
    user = session.get(User, user_id)
    if not user:
        raise ValueError(f"User {user_id} not found")

    # Создаем личный календарь
    personal_calendar = Calendar(
        name=f"Личный календарь",
        description=f"Личный календарь {user.full_name or user.email}",
        owner_id=user_id,
        color="#2563eb",  # Синий цвет по умолчанию
        timezone="UTC",
        is_active=True,
    )
    session.add(personal_calendar)
    session.commit()
    session.refresh(personal_calendar)

    return personal_calendar


def get_personal_calendar(session: Session, user_id: UUID) -> Calendar | None:
    """
    Возвращает личный календарь пользователя, если он существует.
    """
    return session.exec(
        select(Calendar).where(
            Calendar.owner_id == user_id,
            Calendar.name == f"Личный календарь",
        )
    ).first()


