from __future__ import annotations

from datetime import datetime
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class EventCommentBase(BaseModel):
    content: str = Field(max_length=2000, min_length=1)


class EventCommentCreate(EventCommentBase):
    # event_id берется из URL параметра, user_id из current_user
    pass


class EventCommentUpdate(BaseModel):
    content: Optional[str] = Field(None, max_length=2000, min_length=1)


class EventCommentRead(EventCommentBase):
    id: UUID
    event_id: UUID
    user_id: UUID
    created_at: datetime
    updated_at: datetime
    is_deleted: bool
    deleted_at: Optional[datetime] = None
    # User info (will be populated by API)
    user_email: Optional[str] = None
    user_full_name: Optional[str] = None
    user_avatar_url: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)

