from __future__ import annotations

from datetime import datetime
from uuid import UUID, uuid4

from sqlmodel import Field, SQLModel


class Notification(SQLModel, table=True):
    """User notification."""

    __tablename__ = "notifications"

    id: UUID = Field(default_factory=uuid4, primary_key=True, index=True)
    user_id: UUID = Field(foreign_key="users.id", nullable=False, index=True)
    event_id: UUID | None = Field(default=None, foreign_key="events.id", nullable=True, index=True)
    ticket_id: UUID | None = Field(default=None, foreign_key="tickets.id", nullable=True, index=True)
    type: str = Field(max_length=50)  # event_invited, event_updated, event_reminder, event_cancelled, ticket_assigned, ticket_comment, ticket_status_changed
    title: str = Field(max_length=255)
    message: str = Field(max_length=1000)
    is_read: bool = Field(default=False, index=True)
    is_deleted: bool = Field(default=False, index=True)  # Мягкое удаление
    created_at: datetime = Field(default_factory=datetime.utcnow, nullable=False, index=True)
    read_at: datetime | None = Field(default=None, nullable=True)
    deleted_at: datetime | None = Field(default=None, nullable=True)


