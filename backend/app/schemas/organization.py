from __future__ import annotations

from typing import Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict


class OrganizationBase(BaseModel):
    name: str
    slug: str
    timezone: str = "UTC"
    description: Optional[str] = None
    logo_url: Optional[str] = None
    primary_color: Optional[str] = None
    secondary_color: Optional[str] = None


class OrganizationCreate(OrganizationBase):
    pass


class OrganizationRead(OrganizationBase):
    id: UUID

    model_config = ConfigDict(from_attributes=True)

