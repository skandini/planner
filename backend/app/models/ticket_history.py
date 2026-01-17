from __future__ import annotations

from datetime import datetime
from typing import Optional
from uuid import UUID, uuid4

from sqlmodel import Field, SQLModel


class TicketHistoryAction:
    """Типы действий в истории тикета."""
    CREATED = "created"
    STATUS_CHANGED = "status_changed"
    PRIORITY_CHANGED = "priority_changed"
    ASSIGNED = "assigned"
    UNASSIGNED = "unassigned"
    REASSIGNED = "reassigned"
    CATEGORY_CHANGED = "category_changed"
    TITLE_CHANGED = "title_changed"
    DESCRIPTION_CHANGED = "description_changed"
    COMMENT_ADDED = "comment_added"
    ATTACHMENT_ADDED = "attachment_added"
    ATTACHMENT_REMOVED = "attachment_removed"
    INTERNAL_NOTE_ADDED = "internal_note_added"


class TicketHistory(SQLModel, table=True):
    """Represents a history entry for ticket changes (visible only to staff)."""

    __tablename__ = "ticket_history"

    id: UUID = Field(default_factory=uuid4, primary_key=True, index=True)
    ticket_id: UUID = Field(foreign_key="tickets.id", index=True)
    user_id: UUID = Field(foreign_key="users.id", index=True)  # Кто сделал изменение
    action: str = Field(max_length=50, index=True)  # Тип действия
    field_name: Optional[str] = Field(default=None, max_length=50)  # Какое поле изменилось
    old_value: Optional[str] = Field(default=None, max_length=1000)  # Старое значение
    new_value: Optional[str] = Field(default=None, max_length=1000)  # Новое значение
    details: Optional[str] = Field(default=None, max_length=2000)  # Дополнительные детали (JSON)
    created_at: datetime = Field(default_factory=datetime.utcnow, nullable=False, index=True)

