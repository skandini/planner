from __future__ import annotations

from datetime import datetime
from typing import Optional
from uuid import UUID, uuid4

from sqlmodel import Field, SQLModel


class TicketStatus:
    OPEN = "open"
    IN_PROGRESS = "in_progress"
    WAITING_RESPONSE = "waiting_response"
    WAITING_THIRD_PARTY = "waiting_third_party"  # Ожидание ответа от третьей стороны
    ON_HOLD = "on_hold"  # Отложен
    RESOLVED = "resolved"
    CLOSED = "closed"


class TicketPriority:
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    URGENT = "urgent"
    CRITICAL = "critical"  # Критический


class Ticket(SQLModel, table=True):
    """Represents a support ticket."""

    __tablename__ = "tickets"

    id: UUID = Field(default_factory=uuid4, primary_key=True, index=True)
    title: str = Field(max_length=255, index=True)
    description: str = Field(max_length=5000)
    status: str = Field(default=TicketStatus.OPEN, index=True)
    priority: str = Field(default=TicketPriority.MEDIUM, index=True)
    category_id: Optional[UUID] = Field(default=None, foreign_key="ticket_categories.id", nullable=True, index=True)
    created_by: UUID = Field(foreign_key="users.id", index=True)
    assigned_to: Optional[UUID] = Field(default=None, foreign_key="users.id", nullable=True, index=True)
    # Дополнительные поля для HELP DESK
    due_date: Optional[datetime] = Field(default=None, nullable=True)  # Крайний срок
    first_response_at: Optional[datetime] = Field(default=None, nullable=True)  # Время первого ответа
    sla_breach: bool = Field(default=False)  # Нарушение SLA
    tags: Optional[str] = Field(default=None, max_length=500)  # Теги через запятую
    # Timestamps
    created_at: datetime = Field(default_factory=datetime.utcnow, nullable=False, index=True)
    updated_at: datetime = Field(default_factory=datetime.utcnow, nullable=False)
    resolved_at: Optional[datetime] = None
    closed_at: Optional[datetime] = None
    is_deleted: bool = Field(default=False, index=True)
    deleted_at: Optional[datetime] = None

    def touch(self):
        """Updates the updated_at timestamp."""
        self.updated_at = datetime.utcnow()

