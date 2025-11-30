from __future__ import annotations

from datetime import datetime
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class RoomBase(BaseModel):
    name: str = Field(max_length=255)
    description: Optional[str] = Field(default=None, max_length=500)
    capacity: int = Field(default=1, ge=1)
    location: Optional[str] = Field(default=None, max_length=255)
    equipment: Optional[str] = Field(default=None, max_length=1000)
    is_active: bool = Field(default=True)
    organization_id: Optional[UUID] = None


class RoomCreate(RoomBase):
    pass


class RoomUpdate(BaseModel):
    name: Optional[str] = Field(default=None, max_length=255)
    description: Optional[str] = Field(default=None, max_length=500)
    capacity: Optional[int] = Field(default=None, ge=1)
    location: Optional[str] = Field(default=None, max_length=255)
    equipment: Optional[str] = Field(default=None, max_length=1000)
    is_active: Optional[bool] = None
    organization_id: Optional[UUID] = None


class RoomRead(RoomBase):
    id: UUID
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)

