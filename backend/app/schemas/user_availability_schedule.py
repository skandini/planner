from __future__ import annotations

from datetime import datetime
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class TimeSlot(BaseModel):
    """Time slot for availability."""
    start: str = Field(..., description="Start time in HH:MM format")
    end: str = Field(..., description="End time in HH:MM format")
    label: Optional[str] = Field(default=None, max_length=255, description="Optional label/description for this time slot")


class AvailabilitySchedule(BaseModel):
    """Availability schedule for a day of week."""
    monday: list[TimeSlot] = Field(default=[], description="Monday availability slots")
    tuesday: list[TimeSlot] = Field(default=[], description="Tuesday availability slots")
    wednesday: list[TimeSlot] = Field(default=[], description="Wednesday availability slots")
    thursday: list[TimeSlot] = Field(default=[], description="Thursday availability slots")
    friday: list[TimeSlot] = Field(default=[], description="Friday availability slots")
    saturday: list[TimeSlot] = Field(default=[], description="Saturday availability slots")
    sunday: list[TimeSlot] = Field(default=[], description="Sunday availability slots")


class UserAvailabilityScheduleBase(BaseModel):
    """Base schema for user availability schedule."""
    schedule: Optional[dict] = Field(default_factory=dict, description="Availability schedule by day of week")
    timezone: str = Field(default="UTC", max_length=64, description="User timezone")


class UserAvailabilityScheduleCreate(UserAvailabilityScheduleBase):
    """Schema for creating user availability schedule."""
    pass


class UserAvailabilityScheduleUpdate(BaseModel):
    """Schema for updating user availability schedule."""
    schedule: Optional[dict] = None
    timezone: Optional[str] = Field(default=None, max_length=64)


class UserAvailabilityScheduleRead(UserAvailabilityScheduleBase):
    """Schema for reading user availability schedule."""
    id: UUID
    user_id: UUID
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)

