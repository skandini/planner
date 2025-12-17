from __future__ import annotations

from datetime import datetime
from typing import Optional
from uuid import UUID, uuid4

from sqlalchemy import Column, JSON
from sqlmodel import Field, SQLModel


class UserAvailabilitySchedule(SQLModel, table=True):
    """User availability schedule for meeting times."""

    __tablename__ = "user_availability_schedules"

    id: UUID = Field(default_factory=uuid4, primary_key=True, index=True)
    user_id: UUID = Field(foreign_key="users.id", nullable=False, index=True, unique=True)
    
    # Расписание доступности по дням недели
    # Формат: {
    #   "monday": [{"start": "09:00", "end": "18:00"}],
    #   "tuesday": [{"start": "09:00", "end": "18:00"}],
    #   ...
    # }
    # Если день отсутствует или пустой массив - день недоступен
    schedule: Optional[dict] = Field(default_factory=dict, sa_column=Column(JSON, nullable=True))
    
    # Часовой пояс пользователя (по умолчанию UTC)
    timezone: str = Field(default="UTC", max_length=64)
    
    created_at: datetime = Field(default_factory=datetime.utcnow, nullable=False)
    updated_at: datetime = Field(default_factory=datetime.utcnow, nullable=False)

    def model_post_init(self, __context) -> None:
        """Update updated_at on modification."""
        self.updated_at = datetime.utcnow()

