from __future__ import annotations

from datetime import datetime
from typing import Optional
from uuid import UUID, uuid4

from sqlmodel import Field, SQLModel


class TicketInternalNote(SQLModel, table=True):
    """Represents an internal note on a ticket (visible only to staff/IT)."""

    __tablename__ = "ticket_internal_notes"

    id: UUID = Field(default_factory=uuid4, primary_key=True, index=True)
    ticket_id: UUID = Field(foreign_key="tickets.id", index=True)
    user_id: UUID = Field(foreign_key="users.id", index=True)  # Кто создал заметку
    content: str = Field(max_length=5000)
    is_pinned: bool = Field(default=False)  # Закрепленная заметка
    created_at: datetime = Field(default_factory=datetime.utcnow, nullable=False, index=True)
    updated_at: datetime = Field(default_factory=datetime.utcnow, nullable=False)
    is_deleted: bool = Field(default=False, index=True)
    deleted_at: Optional[datetime] = None

    def touch(self):
        """Updates the updated_at timestamp."""
        self.updated_at = datetime.utcnow()

