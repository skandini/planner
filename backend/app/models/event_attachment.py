from __future__ import annotations

from datetime import datetime
from typing import Optional
from uuid import UUID, uuid4

from sqlmodel import Field, SQLModel


class EventAttachment(SQLModel, table=True):
    """File attachment for an event."""

    __tablename__ = "event_attachments"

    id: UUID = Field(default_factory=uuid4, primary_key=True, index=True)
    event_id: UUID = Field(foreign_key="events.id", nullable=False, index=True)
    filename: str = Field(max_length=255)
    original_filename: str = Field(max_length=255)
    file_size: int = Field(ge=0)  # Размер файла в байтах
    content_type: str = Field(max_length=100)  # MIME type
    file_path: str = Field(max_length=500)  # Путь к файлу на сервере
    uploaded_by: UUID = Field(foreign_key="users.id", nullable=False)
    created_at: datetime = Field(default_factory=datetime.utcnow, nullable=False)

    def touch(self) -> None:
        """Update timestamp."""
        pass  # Attachments don't need touch, they're immutable

