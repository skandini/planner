from __future__ import annotations

import re
from typing import List
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import select

from app.api.deps import get_current_user, is_admin_or_it
from app.db import SessionDep
from app.models import Organization, Department, User
from app.schemas.organization import OrganizationCreate, OrganizationRead, OrganizationUpdate

router = APIRouter()


def sync_organizations_from_departments(session: SessionDep) -> None:
    """Auto-create organizations for root departments without organization."""
    # Find root departments without organization
    root_depts_without_org = session.exec(
        select(Department).where(
            Department.parent_id == None,
            Department.organization_id == None
        )
    ).all()
    
    for dept in root_depts_without_org:
        # Create slug from department name
        slug = re.sub(r'[^a-z0-9-]', '', dept.name.lower().replace(' ', '-'))
        if not slug:
            slug = f"org-{dept.id}"[:50]
        
        # Check if organization with this slug exists
        existing_org = session.exec(
            select(Organization).where(Organization.slug == slug)
        ).first()
        
        if existing_org:
            # Link department to existing organization
            dept.organization_id = existing_org.id
        else:
            # Create new organization
            new_org = Organization(
                name=dept.name,
                slug=slug,
                timezone="Europe/Moscow"
            )
            session.add(new_org)
            session.flush()
            dept.organization_id = new_org.id
        
        session.add(dept)
    
    if root_depts_without_org:
        session.commit()


@router.get("/", response_model=List[OrganizationRead], summary="List organizations")
def list_organizations(
    session: SessionDep,
    current_user: User = Depends(get_current_user),
) -> List[OrganizationRead]:
    """List all organizations. Auto-syncs with root departments."""
    # Auto-sync organizations from root departments
    sync_organizations_from_departments(session)
    
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


@router.post(
    "/",
    response_model=OrganizationRead,
    status_code=status.HTTP_201_CREATED,
    summary="Create organization (admin/IT only)",
)
def create_organization(
    payload: OrganizationCreate,
    session: SessionDep,
    current_user: User = Depends(get_current_user),
) -> OrganizationRead:
    """Create a new organization. Only admins and IT can create organizations."""
    if not is_admin_or_it(current_user, session):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only admins and IT can create organizations",
        )
    
    # Check if slug is unique
    existing = session.exec(
        select(Organization).where(Organization.slug == payload.slug)
    ).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Organization with slug '{payload.slug}' already exists",
        )
    
    organization = Organization(**payload.model_dump())
    session.add(organization)
    session.commit()
    session.refresh(organization)
    return OrganizationRead.model_validate(organization)


@router.put(
    "/{organization_id}",
    response_model=OrganizationRead,
    summary="Update organization (admin/IT only)",
)
def update_organization(
    organization_id: UUID,
    payload: OrganizationUpdate,
    session: SessionDep,
    current_user: User = Depends(get_current_user),
) -> OrganizationRead:
    """Update an organization. Only admins and IT can update organizations."""
    if not is_admin_or_it(current_user, session):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only admins and IT can update organizations",
        )
    
    organization = session.get(Organization, organization_id)
    if not organization:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Organization not found",
        )
    
    # Check if new slug is unique (if changing)
    payload_dict = payload.model_dump(exclude_unset=True)
    if "slug" in payload_dict and payload_dict["slug"] != organization.slug:
        existing = session.exec(
            select(Organization).where(Organization.slug == payload_dict["slug"])
        ).first()
        if existing:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Organization with slug '{payload_dict['slug']}' already exists",
            )
    
    # Update fields
    for field, value in payload_dict.items():
        setattr(organization, field, value)
    
    session.add(organization)
    session.commit()
    session.refresh(organization)
    return OrganizationRead.model_validate(organization)


@router.delete(
    "/{organization_id}",
    status_code=status.HTTP_200_OK,
    summary="Delete organization (admin/IT only)",
)
def delete_organization(
    organization_id: UUID,
    session: SessionDep,
    current_user: User = Depends(get_current_user),
) -> dict:
    """Delete an organization. Only admins and IT can delete organizations."""
    if not is_admin_or_it(current_user, session):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only admins and IT can delete organizations",
        )
    
    organization = session.get(Organization, organization_id)
    if not organization:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Organization not found",
        )
    
    session.delete(organization)
    session.commit()
    return {"message": "Organization deleted successfully"}

