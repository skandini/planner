from __future__ import annotations

from collections.abc import Generator
from typing import Annotated

from fastapi import Depends
from sqlmodel import Session, SQLModel, create_engine
from sqlalchemy import event

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
    connect_args = {}
    if settings.DATABASE_URL.startswith("sqlite"):
        # SQLite настройки для предотвращения блокировок
        connect_args = {
            "check_same_thread": False,
            "timeout": 20.0,  # Таймаут для ожидания блокировки (20 секунд)
        }
        # Используем WAL mode для лучшей параллельной работы
        # Это нужно делать через событие после подключения
        engine = create_engine(settings.DATABASE_URL, connect_args=connect_args)
        # Включаем WAL mode для SQLite (улучшает параллельный доступ)
        @event.listens_for(engine, "connect")
        def set_sqlite_pragma(dbapi_conn, connection_record):
            cursor = dbapi_conn.cursor()
            cursor.execute("PRAGMA journal_mode=WAL")
            cursor.close()
        return engine
    return create_engine(settings.DATABASE_URL, connect_args=connect_args)


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

