from __future__ import annotations

from datetime import datetime
from uuid import UUID

from sqlmodel import Field, SQLModel


class CalendarMember(SQLModel, table=True):
    """Calendar membership with per-user role."""

    __tablename__ = "calendar_members"
    __table_args__ = {"sqlite_autoincrement": False}

    calendar_id: UUID = Field(
        foreign_key="calendars.id", primary_key=True, nullable=False
    )
    user_id: UUID = Field(foreign_key="users.id", primary_key=True, nullable=False)
    role: str = Field(default="viewer", max_length=32)
    added_at: datetime = Field(default_factory=datetime.utcnow, nullable=False)


