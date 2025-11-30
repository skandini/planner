from __future__ import annotations

from datetime import datetime
from typing import Optional
from uuid import UUID, uuid4

from sqlmodel import Field, SQLModel


class Calendar(SQLModel, table=True):
    """Calendars that group events per team or resource."""

    __tablename__ = "calendars"

    id: UUID = Field(default_factory=uuid4, primary_key=True, index=True)
    name: str = Field(max_length=255)
    description: Optional[str] = Field(default=None, max_length=500)
    timezone: str = Field(default="UTC", max_length=64)
    color: str = Field(default="#2563eb", max_length=16)
    is_active: bool = Field(default=True)
    created_at: datetime = Field(default_factory=datetime.utcnow, nullable=False)
    updated_at: datetime = Field(default_factory=datetime.utcnow, nullable=False)
    organization_id: Optional[UUID] = Field(
        default=None, foreign_key="organizations.id", nullable=True
    )
    owner_id: Optional[UUID] = Field(
        default=None, foreign_key="users.id", nullable=True, index=True
    )

    def touch(self) -> None:
        self.updated_at = datetime.utcnow()

