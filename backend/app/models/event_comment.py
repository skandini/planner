from __future__ import annotations

from datetime import datetime
from typing import Optional
from uuid import UUID, uuid4

from sqlmodel import Field, SQLModel


class EventComment(SQLModel, table=True):
    """Comment on an event."""

    __tablename__ = "event_comments"

    id: UUID = Field(default_factory=uuid4, primary_key=True, index=True)
    event_id: UUID = Field(
        foreign_key="events.id", nullable=False, index=True
    )
    user_id: UUID = Field(
        foreign_key="users.id", nullable=False, index=True
    )
    content: str = Field(max_length=2000)
    created_at: datetime = Field(default_factory=datetime.utcnow, nullable=False)
    updated_at: datetime = Field(default_factory=datetime.utcnow, nullable=False)
    # Soft delete
    is_deleted: bool = Field(default=False, index=True)
    deleted_at: Optional[datetime] = Field(default=None, nullable=True)

    def touch(self) -> None:
        """Update timestamp."""
        self.updated_at = datetime.utcnow()

