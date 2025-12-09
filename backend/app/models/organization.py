from __future__ import annotations

from typing import Optional
from uuid import UUID, uuid4

from sqlmodel import Field, SQLModel


class Organization(SQLModel, table=True):
    """Represents a company or department using the calendar."""

    __tablename__ = "organizations"

    id: UUID = Field(default_factory=uuid4, primary_key=True, index=True)
    name: str = Field(max_length=255)
    slug: str = Field(max_length=255, unique=True, index=True)
    timezone: str = Field(default="UTC", max_length=64)
    description: Optional[str] = Field(default=None, max_length=500)
    logo_url: Optional[str] = Field(default=None, max_length=500)
    primary_color: Optional[str] = Field(default=None, max_length=7)  # Hex color
    secondary_color: Optional[str] = Field(default=None, max_length=7)  # Hex color


