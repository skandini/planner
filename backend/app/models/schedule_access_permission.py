from __future__ import annotations

from datetime import datetime
from typing import Optional
from uuid import UUID, uuid4

from sqlmodel import Field, SQLModel


class ScheduleAccessPermission(SQLModel, table=True):
    """Права доступа к просмотру расписания сотрудников."""

    __tablename__ = "schedule_access_permissions"

    id: UUID = Field(default_factory=uuid4, primary_key=True, index=True)
    # Пользователь, которому предоставлен доступ
    granted_to_user_id: UUID = Field(
        foreign_key="users.id", nullable=False, index=True
    )
    # Пользователь, расписание которого можно просматривать (если null, то доступ к отделу)
    target_user_id: Optional[UUID] = Field(
        default=None, foreign_key="users.id", nullable=True, index=True
    )
    # Отдел, расписание сотрудников которого можно просматривать (если null, то доступ к конкретному пользователю)
    target_department_id: Optional[UUID] = Field(
        default=None, foreign_key="departments.id", nullable=True, index=True
    )
    # Пользователь, который предоставил доступ
    granted_by_user_id: UUID = Field(
        foreign_key="users.id", nullable=False, index=True
    )
    created_at: datetime = Field(default_factory=datetime.utcnow, nullable=False)
    updated_at: datetime = Field(default_factory=datetime.utcnow, nullable=False)

    def touch(self) -> None:
        """Обновляет время изменения."""
        self.updated_at = datetime.utcnow()

