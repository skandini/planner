from __future__ import annotations

from datetime import datetime
from typing import List, Optional
from uuid import UUID

from pydantic import BaseModel


class DepartmentBase(BaseModel):
    name: str
    description: Optional[str] = None
    organization_id: Optional[UUID] = None
    parent_id: Optional[UUID] = None
    manager_id: Optional[UUID] = None


class DepartmentCreate(DepartmentBase):
    pass


class DepartmentUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    organization_id: Optional[UUID] = None
    parent_id: Optional[UUID] = None
    manager_id: Optional[UUID] = None


class DepartmentRead(DepartmentBase):
    id: UUID
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class DepartmentReadWithChildren(DepartmentRead):
    children: List["DepartmentReadWithChildren"] = []
    employee_count: int = 0
    manager_name: Optional[str] = None

    class Config:
        from_attributes = True



