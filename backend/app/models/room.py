from __future__ import annotations

from datetime import datetime
from typing import Optional
from uuid import UUID, uuid4

from sqlmodel import Field, SQLModel


class Room(SQLModel, table=True):
    """Meeting rooms and resources available for booking."""

    __tablename__ = "rooms"

    id: UUID = Field(default_factory=uuid4, primary_key=True, index=True)
    name: str = Field(max_length=255)
    description: Optional[str] = Field(default=None, max_length=500)
    capacity: int = Field(default=1, ge=1)
    location: Optional[str] = Field(default=None, max_length=255)
    equipment: Optional[str] = Field(
        default=None, max_length=1000
    )  # JSON string or comma-separated
    is_active: bool = Field(default=True)
    created_at: datetime = Field(default_factory=datetime.utcnow, nullable=False)
    updated_at: datetime = Field(default_factory=datetime.utcnow, nullable=False)
    organization_id: Optional[UUID] = Field(
        default=None, foreign_key="organizations.id", nullable=True
    )

    def touch(self) -> None:
        self.updated_at = datetime.utcnow()


