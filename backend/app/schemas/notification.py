from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel


class NotificationBase(BaseModel):
    type: str
    title: str
    message: str


class NotificationCreate(NotificationBase):
    user_id: UUID
    event_id: UUID | None = None


class NotificationRead(NotificationBase):
    id: UUID
    user_id: UUID
    event_id: UUID | None
    is_read: bool
    is_deleted: bool
    created_at: datetime
    read_at: datetime | None
    deleted_at: datetime | None

    model_config = {"from_attributes": True}


class NotificationUpdate(BaseModel):
    is_read: bool | None = None
    is_deleted: bool | None = None


