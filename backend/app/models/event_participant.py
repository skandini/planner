from __future__ import annotations

from datetime import datetime
from uuid import UUID

from sqlmodel import Field, SQLModel


class EventParticipant(SQLModel, table=True):
    """Event participant with response status."""

    __tablename__ = "event_participants"
    __table_args__ = {"sqlite_autoincrement": False}

    event_id: UUID = Field(
        foreign_key="events.id", primary_key=True, nullable=False
    )
    user_id: UUID = Field(foreign_key="users.id", primary_key=True, nullable=False)
    response_status: str = Field(default="needs_action", max_length=32)  # needs_action, accepted, declined
    added_at: datetime = Field(default_factory=datetime.utcnow, nullable=False)


