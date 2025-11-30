from __future__ import annotations

from datetime import datetime
from typing import Literal, Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict, EmailStr


class CalendarBase(BaseModel):
    name: str
    description: Optional[str] = None
    timezone: str = "UTC"
    color: str = "#2563eb"
    is_active: bool = True
    organization_id: Optional[UUID] = None


class CalendarCreate(CalendarBase):
    pass


class CalendarUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    timezone: Optional[str] = None
    color: Optional[str] = None
    is_active: Optional[bool] = None
    organization_id: Optional[UUID] = None


class CalendarRead(CalendarBase):
    id: UUID
    created_at: datetime
    updated_at: datetime
    owner_id: Optional[UUID] = None

    model_config = ConfigDict(from_attributes=True)


class CalendarMemberRead(BaseModel):
    calendar_id: UUID
    user_id: UUID
    role: str
    added_at: datetime
    email: EmailStr
    full_name: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


class CalendarMemberCreate(BaseModel):
    user_id: UUID
    role: str = "viewer"


class CalendarMemberUpdate(BaseModel):
    role: str


class CalendarReadWithRole(CalendarRead):
    current_user_role: Optional[str] = None
    members: list[CalendarMemberRead] = []


class ConflictEventSummary(BaseModel):
    id: UUID
    title: str
    starts_at: datetime
    ends_at: datetime
    room_id: Optional[UUID] = None


class ConflictEntry(BaseModel):
    type: Literal["room", "participant"]
    resource_id: Optional[UUID] = None
    resource_label: str
    slot_start: datetime
    slot_end: datetime
    events: list[ConflictEventSummary]

