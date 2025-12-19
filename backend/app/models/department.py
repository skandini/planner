from __future__ import annotations

from datetime import datetime
from typing import Optional
from uuid import UUID, uuid4

from sqlmodel import Field, SQLModel


class Department(SQLModel, table=True):
    """Department within an organization."""

    __tablename__ = "departments"

    id: UUID = Field(default_factory=uuid4, primary_key=True, index=True)
    name: str = Field(max_length=255)
    description: Optional[str] = Field(default=None, max_length=500)
    organization_id: Optional[UUID] = Field(
        default=None, foreign_key="organizations.id", nullable=True, index=True
    )
    parent_id: Optional[UUID] = Field(
        default=None, foreign_key="departments.id", nullable=True, index=True
    )
    manager_id: Optional[UUID] = Field(
        default=None, foreign_key="users.id", nullable=True, index=True
    )
    color: Optional[str] = Field(default=None, max_length=7, description="Hex color code for department (e.g., #FF5733)")
    created_at: datetime = Field(default_factory=datetime.utcnow, nullable=False)
    updated_at: datetime = Field(default_factory=datetime.utcnow, nullable=False)

    def touch(self) -> None:
        """Update timestamp."""
        self.updated_at = datetime.utcnow()
