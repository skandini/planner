from __future__ import annotations

from datetime import datetime
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class AvailabilitySlotBase(BaseModel):
    """Base schema for availability slot."""
    process_name: str = Field(..., max_length=255, description="Process/meeting type name (e.g., 'встреча с клиентами')")
    starts_at: datetime = Field(..., description="Slot start time")
    ends_at: datetime = Field(..., description="Slot end time")
    description: Optional[str] = Field(default=None, max_length=1000, description="Optional slot description")


class AvailabilitySlotCreate(AvailabilitySlotBase):
    """Schema for creating availability slot."""
    pass


class AvailabilitySlotUpdate(BaseModel):
    """Schema for updating availability slot."""
    process_name: Optional[str] = Field(default=None, max_length=255)
    starts_at: Optional[datetime] = None
    ends_at: Optional[datetime] = None
    description: Optional[str] = Field(default=None, max_length=1000)
    status: Optional[str] = Field(default=None, max_length=50)


class AvailabilitySlotRead(AvailabilitySlotBase):
    """Schema for reading availability slot."""
    id: UUID
    user_id: UUID
    status: str
    booked_by: Optional[UUID] = None
    booked_at: Optional[datetime] = None
    event_id: Optional[UUID] = None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class AvailabilitySlotWithUser(AvailabilitySlotRead):
    """Availability slot with user information."""
    user_name: Optional[str] = None
    user_email: str
    user_department: Optional[str] = None
    booked_by_user_name: Optional[str] = None
    booked_by_user_email: Optional[str] = None


class BookSlotRequest(BaseModel):
    """Request to book an availability slot."""
    calendar_id: UUID = Field(..., description="Calendar ID where to create the event")
    title: str = Field(..., max_length=255, description="Event title")
    description: Optional[str] = Field(default=None, max_length=2000, description="Event description")
    room_id: Optional[UUID] = Field(default=None, description="Optional room ID")
    participant_ids: Optional[list[UUID]] = Field(default_factory=list, description="Additional participant IDs")

