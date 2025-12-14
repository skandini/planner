from __future__ import annotations

from datetime import date, datetime
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict, EmailStr, Field


class UserBase(BaseModel):
    email: EmailStr
    full_name: Optional[str] = None
    phone: Optional[str] = None
    position: Optional[str] = None
    department: Optional[str] = None  # Legacy field
    department_id: Optional[UUID] = None
    manager_id: Optional[UUID] = None
    organization_id: Optional[UUID] = None
    avatar_url: Optional[str] = None
    # Настройки проекта
    show_local_time: bool = True
    show_moscow_time: bool = True
    # День рождения
    birthday: Optional[date] = None


class UserCreate(UserBase):
    password: str = Field(min_length=8, max_length=128)


class UserUpdate(BaseModel):
    """Schema for partial user updates."""
    email: Optional[EmailStr] = None
    full_name: Optional[str] = None
    phone: Optional[str] = None
    position: Optional[str] = None
    department: Optional[str] = None  # Legacy field
    department_id: Optional[UUID] = None  # Legacy - for backward compatibility
    manager_id: Optional[UUID] = None
    organization_id: Optional[UUID] = None  # Legacy - for backward compatibility
    avatar_url: Optional[str] = None
    # Many-to-many relationships
    department_ids: Optional[list[UUID]] = None  # All departments user belongs to
    organization_ids: Optional[list[UUID]] = None  # All organizations user belongs to
    # Настройки проекта
    show_local_time: Optional[bool] = None
    show_moscow_time: Optional[bool] = None
    # День рождения
    birthday: Optional[date] = None


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class UserRead(UserBase):
    id: UUID
    is_active: bool
    role: str
    created_at: datetime
    # Many-to-many relationships
    department_ids: list[UUID] = []  # All departments user belongs to
    organization_ids: list[UUID] = []  # All organizations user belongs to

    model_config = ConfigDict(from_attributes=True)


class TokenPair(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class RefreshTokenRequest(BaseModel):
    refresh_token: str

