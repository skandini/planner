from __future__ import annotations

from datetime import datetime
from typing import Optional
from uuid import UUID, uuid4

from sqlalchemy import Column, JSON
from sqlmodel import Field, SQLModel


class Event(SQLModel, table=True):
    """Calendar event."""

    __tablename__ = "events"

    id: UUID = Field(default_factory=uuid4, primary_key=True, index=True)
    calendar_id: UUID = Field(foreign_key="calendars.id", nullable=False, index=True)
    room_id: Optional[UUID] = Field(
        default=None, foreign_key="rooms.id", nullable=True, index=True
    )
    title: str = Field(max_length=255)
    description: Optional[str] = Field(default=None, max_length=2000)
    location: Optional[str] = Field(default=None, max_length=255)
    timezone: str = Field(default="UTC", max_length=64)
    starts_at: datetime = Field(nullable=False, index=True)
    ends_at: datetime = Field(nullable=False, index=True)
    all_day: bool = Field(default=False)
    status: str = Field(default="confirmed", max_length=50)
    recurrence_rule: Optional[dict] = Field(
        default=None, sa_column=Column(JSON, nullable=True)
    )
    recurrence_parent_id: Optional[UUID] = Field(
        default=None, foreign_key="events.id", index=True, nullable=True
    )
    created_at: datetime = Field(default_factory=datetime.utcnow, nullable=False)
    updated_at: datetime = Field(default_factory=datetime.utcnow, nullable=False)

    def touch(self) -> None:
        self.updated_at = datetime.utcnow()

