from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict


class EventAttachmentRead(BaseModel):
    """Schema for reading event attachment."""

    id: UUID
    event_id: UUID
    filename: str
    original_filename: str
    file_size: int
    content_type: str
    uploaded_by: UUID
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class EventAttachmentCreate(BaseModel):
    """Schema for creating event attachment (used internally)."""

    event_id: UUID
    filename: str
    original_filename: str
    file_size: int
    content_type: str
    file_path: str
    uploaded_by: UUID

