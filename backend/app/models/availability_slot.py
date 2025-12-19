from __future__ import annotations

from datetime import datetime
from typing import Optional
from uuid import UUID, uuid4

from sqlmodel import Field, SQLModel


class AvailabilitySlot(SQLModel, table=True):
    """Availability slot offered by a user for a specific process."""

    __tablename__ = "availability_slots"

    id: UUID = Field(default_factory=uuid4, primary_key=True, index=True)
    user_id: UUID = Field(foreign_key="users.id", nullable=False, index=True)
    
    # Название процесса/типа встречи (например, "встреча с клиентами")
    process_name: str = Field(max_length=255, nullable=False, index=True)
    
    # Время слота
    starts_at: datetime = Field(nullable=False, index=True)
    ends_at: datetime = Field(nullable=False, index=True)
    
    # Описание слота (опционально)
    description: Optional[str] = Field(default=None, max_length=1000)
    
    # Статус слота: available, booked, cancelled
    status: str = Field(default="available", max_length=50, index=True)
    
    # Кто забронировал слот (если забронирован)
    booked_by: Optional[UUID] = Field(default=None, foreign_key="users.id", nullable=True, index=True)
    
    # Когда был забронирован
    booked_at: Optional[datetime] = Field(default=None, nullable=True)
    
    # ID созданного события (если слот был забронирован и создана встреча)
    event_id: Optional[UUID] = Field(default=None, foreign_key="events.id", nullable=True, index=True)
    
    created_at: datetime = Field(default_factory=datetime.utcnow, nullable=False)
    updated_at: datetime = Field(default_factory=datetime.utcnow, nullable=False)

    def model_post_init(self, __context) -> None:
        """Update updated_at on modification."""
        self.updated_at = datetime.utcnow()

