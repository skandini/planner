from __future__ import annotations

from datetime import datetime
from typing import Optional
from uuid import UUID, uuid4

from sqlmodel import Field, SQLModel


class User(SQLModel, table=True):
    """Calendar user record."""

    __tablename__ = "users"

    id: UUID = Field(default_factory=uuid4, primary_key=True, index=True)
    email: str = Field(index=True, unique=True, max_length=255)
    full_name: Optional[str] = Field(default=None, max_length=255)
    hashed_password: str = Field(max_length=255)
    is_active: bool = Field(default=True)
    role: str = Field(default="employee", max_length=50)
    created_at: datetime = Field(default_factory=datetime.utcnow, nullable=False)
    organization_id: Optional[UUID] = Field(
        default=None, foreign_key="organizations.id", nullable=True
    )


