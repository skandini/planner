"""
Модель для групповых участников событий (отделы/организации)
"""
from __future__ import annotations

from datetime import datetime
from uuid import UUID, uuid4

from sqlmodel import Field, SQLModel


class EventGroupParticipant(SQLModel, table=True):
    """
    Групповой участник события (отдел или организация).
    
    Когда отдел или организация добавляются как участник события,
    не проверяется занятость отдельных сотрудников.
    Уведомления отправляются всем сотрудникам группы.
    """
    __tablename__ = "event_group_participants"

    id: UUID = Field(default_factory=uuid4, primary_key=True, index=True)
    event_id: UUID = Field(foreign_key="events.id", nullable=False, index=True)
    
    # Тип группы: 'department' или 'organization'
    group_type: str = Field(max_length=20, nullable=False, index=True)
    
    # ID отдела или организации (в зависимости от group_type)
    group_id: UUID = Field(nullable=False, index=True)
    
    # Кто добавил группу как участника
    added_by: UUID = Field(foreign_key="users.id", nullable=False)
    
    created_at: datetime = Field(default_factory=datetime.utcnow, nullable=False)

