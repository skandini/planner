from __future__ import annotations

from datetime import datetime
from typing import Optional
from uuid import UUID, uuid4

from sqlmodel import Field, SQLModel


class TicketCategory(SQLModel, table=True):
    """Represents a ticket category for classification."""

    __tablename__ = "ticket_categories"

    id: UUID = Field(default_factory=uuid4, primary_key=True, index=True)
    name: str = Field(max_length=100, index=True)
    description: Optional[str] = Field(default=None, max_length=500)
    color: str = Field(default="#6366f1", max_length=20)  # Цвет для UI
    icon: Optional[str] = Field(default=None, max_length=50)  # Иконка (emoji или имя)
    parent_id: Optional[UUID] = Field(default=None, foreign_key="ticket_categories.id", nullable=True)
    sort_order: int = Field(default=0)
    is_active: bool = Field(default=True, index=True)
    created_at: datetime = Field(default_factory=datetime.utcnow, nullable=False)
    updated_at: datetime = Field(default_factory=datetime.utcnow, nullable=False)

    def touch(self):
        """Updates the updated_at timestamp."""
        self.updated_at = datetime.utcnow()

