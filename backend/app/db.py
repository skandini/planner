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
    TicketCategory,
    TicketComment,
    TicketHistory,
    TicketInternalNote,
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
    """Create database tables. Uses create_all which only creates missing tables."""
    # SQLModel.metadata.create_all() безопасно - создаёт только недостающие таблицы
    # и не трогает существующие (checkfirst=True по умолчанию)
    SQLModel.metadata.create_all(bind=engine)


def get_session() -> Generator[Session, None, None]:
    with Session(engine) as session:
        yield session


SessionDep = Annotated[Session, Depends(get_session)]

