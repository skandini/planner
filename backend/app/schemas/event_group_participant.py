"""
Схемы для групповых участников событий
"""
from datetime import datetime
from typing import Literal, Optional
from uuid import UUID

from pydantic import BaseModel, Field


class EventGroupParticipantBase(BaseModel):
    """Базовая схема группового участника"""
    group_type: Literal["department", "organization"] = Field(
        description="Тип группы: отдел или организация"
    )
    group_id: UUID = Field(description="ID отдела или организации")


class EventGroupParticipantCreate(EventGroupParticipantBase):
    """Схема для создания группового участника"""
    pass


class EventGroupParticipantRead(EventGroupParticipantBase):
    """Схема для чтения группового участника"""
    id: UUID
    event_id: UUID
    added_by: UUID
    created_at: datetime
    
    class Config:
        from_attributes = True


class EventGroupParticipantWithDetails(EventGroupParticipantRead):
    """Групповой участник с дополнительными данными"""
    group_name: str = Field(description="Название отдела/организации")
    member_count: int = Field(description="Количество участников в группе")
    added_by_name: str = Field(description="Имя пользователя, добавившего группу")

