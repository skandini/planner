from __future__ import annotations

from datetime import datetime
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class RoomAccessBase(BaseModel):
    """Base schema for room access."""
    
    room_id: UUID
    user_id: Optional[UUID] = None
    department_id: Optional[UUID] = None


class RoomAccessCreate(BaseModel):
    """Schema for creating room access."""
    
    user_id: Optional[UUID] = None
    department_id: Optional[UUID] = None


class RoomAccessRead(RoomAccessBase):
    """Schema for reading room access."""
    
    id: UUID
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class RoomAccessUpdate(BaseModel):
    """Schema for updating room access."""
    
    user_id: Optional[UUID] = None
    department_id: Optional[UUID] = None

