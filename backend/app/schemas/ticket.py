from __future__ import annotations

from datetime import datetime
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from app.models.ticket import TicketPriority, TicketStatus


class TicketBase(BaseModel):
    title: str = Field(max_length=255, min_length=1)
    description: str = Field(max_length=5000, min_length=1)
    priority: str = Field(default=TicketPriority.MEDIUM)


class TicketCreate(TicketBase):
    # created_by is taken from current_user
    pass


class TicketUpdate(BaseModel):
    title: Optional[str] = Field(None, max_length=255, min_length=1)
    description: Optional[str] = Field(None, max_length=5000, min_length=1)
    status: Optional[str] = None
    priority: Optional[str] = None
    assigned_to: Optional[UUID] = None


class TicketRead(TicketBase):
    id: UUID
    status: str
    created_by: UUID
    assigned_to: Optional[UUID] = None
    created_at: datetime
    updated_at: datetime
    resolved_at: Optional[datetime] = None
    closed_at: Optional[datetime] = None
    # User info (will be populated by API)
    created_by_email: Optional[str] = None
    created_by_full_name: Optional[str] = None
    assigned_to_email: Optional[str] = None
    assigned_to_full_name: Optional[str] = None
    # Counts
    comments_count: int = 0
    attachments_count: int = 0

    model_config = ConfigDict(from_attributes=True)

