from __future__ import annotations

from typing import List
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import select

from app.api.deps import get_current_user
from app.db import SessionDep
from app.models import Organization, User
from app.schemas.organization import OrganizationRead

router = APIRouter()


@router.get("/", response_model=List[OrganizationRead], summary="List organizations")
def list_organizations(
    session: SessionDep,
    current_user: User = Depends(get_current_user),
) -> List[OrganizationRead]:
    """List all organizations."""
    statement = select(Organization).order_by(Organization.name.asc())
    return session.exec(statement).all()


@router.get("/{organization_id}", response_model=OrganizationRead, summary="Get organization by ID")
def get_organization(
    organization_id: UUID,
    session: SessionDep,
    current_user: User = Depends(get_current_user),
) -> OrganizationRead:
    """Get organization by ID."""
    organization = session.get(Organization, organization_id)
    if not organization:
        raise HTTPException(status_code=404, detail="Organization not found")
    return OrganizationRead.model_validate(organization)

