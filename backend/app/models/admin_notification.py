from __future__ import annotations

from datetime import datetime, timezone
from uuid import UUID, uuid4

from sqlmodel import Field, SQLModel, Column, JSON


class AdminNotification(SQLModel, table=True):
    """Admin-created system notification."""

    __tablename__ = "admin_notifications"

    id: UUID = Field(default_factory=uuid4, primary_key=True, index=True)
    title: str = Field(max_length=255)
    message: str = Field(max_length=2000)
    created_by: UUID = Field(foreign_key="users.id", nullable=False, index=True)
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc), nullable=False, index=True)
    
    # Получатели: список ID пользователей и отделов (храним как строки в JSON)
    target_user_ids: list[str] = Field(default_factory=list, sa_column=Column(JSON))
    target_department_ids: list[str] = Field(default_factory=list, sa_column=Column(JSON))
    
    # Время отображения (в часах, 0 = бессрочно)
    display_duration_hours: int = Field(default=24, nullable=False)
    
    # Время окончания отображения (вычисляется автоматически)
    expires_at: datetime | None = Field(default=None, nullable=True, index=True)
    
    # Активно ли уведомление
    is_active: bool = Field(default=True, index=True)


class AdminNotificationDismissal(SQLModel, table=True):
    """User dismissals of admin notifications."""

    __tablename__ = "admin_notification_dismissals"

    id: UUID = Field(default_factory=uuid4, primary_key=True, index=True)
    notification_id: UUID = Field(foreign_key="admin_notifications.id", nullable=False, index=True)
    user_id: UUID = Field(foreign_key="users.id", nullable=False, index=True)
    dismissed_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc), nullable=False, index=True)

