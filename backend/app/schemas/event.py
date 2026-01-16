from __future__ import annotations

from datetime import datetime
from typing import List, Literal, Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict, FieldValidationInfo, field_validator


class EventBase(BaseModel):
    calendar_id: UUID
    room_id: Optional[UUID] = None
    title: str
    description: Optional[str] = None
    location: Optional[str] = None
    timezone: str = "UTC"
    starts_at: datetime
    ends_at: datetime
    all_day: bool = False
    status: str = "confirmed"
    recurrence_rule: Optional["RecurrenceRule"] = None

    @field_validator("ends_at")
    @classmethod
    def check_ends_after_start(
        cls, ends_at: datetime, info: FieldValidationInfo
    ) -> datetime:
        starts_at: datetime | None = info.data.get("starts_at")
        if starts_at and ends_at < starts_at:
            raise ValueError("ends_at must be greater than or equal to starts_at")
        return ends_at


class GroupParticipantInput(BaseModel):
    """Входные данные для группового участника"""
    group_type: Literal["department", "organization"]
    group_id: UUID


class EventCreate(EventBase):
    participant_ids: Optional[List[UUID]] = None
    group_participants: Optional[List[GroupParticipantInput]] = None


class EventUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    location: Optional[str] = None
    room_id: Optional[UUID] = None
    timezone: Optional[str] = None
    starts_at: Optional[datetime] = None
    ends_at: Optional[datetime] = None
    all_day: Optional[bool] = None
    status: Optional[str] = None
    participant_ids: Optional[List[UUID]] = None
    recurrence_rule: Optional["RecurrenceRule"] = None

    @field_validator("ends_at")
    @classmethod
    def check_ends_after_start(
        cls, ends_at: datetime, info: FieldValidationInfo
    ) -> datetime | None:
        starts_at: datetime | None = info.data.get("starts_at")
        if starts_at and ends_at and ends_at < starts_at:
            raise ValueError("ends_at must be greater than or equal to starts_at")
        return ends_at


class EventParticipantRead(BaseModel):
    user_id: UUID
    email: str
    full_name: Optional[str] = None
    response_status: str

    model_config = ConfigDict(from_attributes=True)


class EventRead(EventBase):
    id: UUID
    created_at: datetime
    updated_at: datetime
    participants: List[EventParticipantRead] = []
    group_participants: Optional[List["EventGroupParticipantWithDetails"]] = None
    recurrence_parent_id: Optional[UUID] = None
    attachments: Optional[List["EventAttachmentRead"]] = None
    department_color: Optional[str] = None  # Color from the first participant's department
    room_online_meeting_url: Optional[str] = None  # Online meeting URL from the room
    comments_count: int = 0  # Количество комментариев к событию

    model_config = ConfigDict(from_attributes=True)


class RecurrenceRule(BaseModel):
    frequency: Literal["daily", "weekly", "monthly"]
    interval: int = 1
    until: Optional[datetime] = None
    count: Optional[int] = None

    @field_validator("interval")
    @classmethod
    def validate_interval(cls, value: int) -> int:
        if value < 1:
            raise ValueError("interval must be greater than 0")
        return value

    @field_validator("count")
    @classmethod
    def validate_count(cls, value: Optional[int]) -> Optional[int]:
        if value is not None and value < 1:
            raise ValueError("count must be greater than 0")
        return value


class ParticipantStatusUpdate(BaseModel):
    response_status: Literal["accepted", "declined", "needs_action", "pending"]


EventBase.model_rebuild()
EventUpdate.model_rebuild()

# Импортируем для forward reference
from app.schemas.event_attachment import EventAttachmentRead  # noqa: E402
from app.schemas.event_group_participant import EventGroupParticipantWithDetails  # noqa: E402

EventRead.model_rebuild()
