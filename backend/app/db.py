from __future__ import annotations

from collections.abc import Generator
from typing import Annotated

from fastapi import Depends
from sqlmodel import Session, SQLModel, create_engine

from app.core.config import settings

# Импортируем все модели, чтобы они попали в метаданные SQLModel
from app.models import (  # noqa: F401
    AdminNotification,
    AdminNotificationDismissal,
    Calendar,
    CalendarMember,
    Department,
    Event,
    EventAttachment,
    EventComment,
    EventParticipant,
    Notification,
    Organization,
    Room,
    Ticket,
    TicketAttachment,
    TicketComment,
    User,
    UserDepartment,
    UserOrganization,
)


def _build_engine():
    """
    Build database engine with appropriate connection arguments.
    Supports both SQLite and PostgreSQL.
    """
    connect_args = {}
    database_url = settings.DATABASE_URL
    
    if database_url.startswith("sqlite"):
        connect_args = {"check_same_thread": False}
    elif database_url.startswith("postgresql"):
        # PostgreSQL connection pooling settings
        # These are handled by SQLAlchemy automatically
        pass
    
    # For PostgreSQL, use connection pooling
    # For SQLite, use default settings
    # Оптимизированные настройки пула для продакшена
    # Для 4 ядер CPU и 200 пользователей: pool_size должен быть ~20-30
    # max_overflow позволяет создавать дополнительные соединения при пиковых нагрузках
    pool_size = 20 if database_url.startswith("postgresql") else 5
    max_overflow = 40 if database_url.startswith("postgresql") else 10
    
    return create_engine(
        database_url,
        connect_args=connect_args,
        # PostgreSQL-specific optimizations
        pool_pre_ping=True,  # Verify connections before using
        pool_size=pool_size,  # Connection pool size
        max_overflow=max_overflow,  # Max overflow connections
        pool_recycle=3600,  # Recycle connections after 1 hour
        pool_reset_on_return='commit',  # Reset connections on return
    )


engine = _build_engine()


def init_db() -> None:
    """Create database tables in environments without migrations."""
    # Проверяем, существует ли уже таблица tickets (созданная через миграции)
    # Если да, то не создаем таблицы через create_all
    from sqlalchemy import inspect
    inspector = inspect(engine)
    existing_tables = inspector.get_table_names()
    
    # Если таблицы тикетов уже существуют (созданы через миграции), пропускаем create_all
    if "tickets" in existing_tables:
        return
    
    # Иначе создаем все таблицы (для новых установок без миграций)
    SQLModel.metadata.create_all(bind=engine)


def get_session() -> Generator[Session, None, None]:
    with Session(engine) as session:
        yield session


SessionDep = Annotated[Session, Depends(get_session)]

