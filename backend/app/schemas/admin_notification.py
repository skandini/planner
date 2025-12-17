from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field


class AdminNotificationCreate(BaseModel):
    title: str = Field(max_length=255)
    message: str = Field(max_length=2000)
    target_user_ids: list[UUID] = Field(default_factory=list)
    target_department_ids: list[UUID] = Field(default_factory=list)
    display_duration_hours: int = Field(default=24, ge=0, le=168)  # 0-168 часов (неделя)


class AdminNotificationRead(BaseModel):
    id: UUID
    title: str
    message: str
    created_by: UUID
    created_at: datetime
    target_user_ids: list[UUID]
    target_department_ids: list[UUID]
    display_duration_hours: int
    expires_at: datetime | None
    is_active: bool
    is_dismissed: bool = False  # Для конкретного пользователя

    model_config = {"from_attributes": True}


class AdminNotificationDismiss(BaseModel):
    notification_id: UUID

