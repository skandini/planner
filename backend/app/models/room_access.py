from __future__ import annotations

from datetime import datetime
from typing import Optional
from uuid import UUID, uuid4

from sqlmodel import Field, SQLModel


class RoomAccess(SQLModel, table=True):
    """Access control for rooms - can be granted to users or departments."""

    __tablename__ = "room_access"

    id: UUID = Field(default_factory=uuid4, primary_key=True, index=True)
    room_id: UUID = Field(foreign_key="rooms.id", nullable=False, index=True)
    
    # Access can be granted to either a user or a department
    user_id: Optional[UUID] = Field(
        default=None, foreign_key="users.id", nullable=True, index=True
    )
    department_id: Optional[UUID] = Field(
        default=None, foreign_key="departments.id", nullable=True, index=True
    )
    
    # Ensure that either user_id or department_id is set, but not both
    # This will be enforced at the application level
    
    created_at: datetime = Field(default_factory=datetime.utcnow, nullable=False)
    updated_at: datetime = Field(default_factory=datetime.utcnow, nullable=False)

    def touch(self) -> None:
        """Update timestamp."""
        self.updated_at = datetime.utcnow()

