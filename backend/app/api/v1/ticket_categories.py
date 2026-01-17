from __future__ import annotations

from datetime import datetime, timedelta
from typing import List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, and_
from sqlmodel import select

from app.api.deps import get_current_user
from app.db import SessionDep
from app.models import Ticket, TicketCategory, User
from app.models.ticket import TicketPriority, TicketStatus
from app.schemas.ticket import (
    TicketCategoryCreate, TicketCategoryRead, TicketCategoryUpdate,
    TicketStatistics, TicketStatusStats, TicketPriorityStats,
    TicketCategoryStats, TicketAssigneeStats
)

router = APIRouter()


def is_staff(user: User) -> bool:
    """Check if user is staff (admin or IT)."""
    return user.role in ("admin", "it")


def get_status_label(st: str) -> str:
    """Get human-readable status label."""
    labels = {
        "open": "Открыт",
        "in_progress": "В работе",
        "waiting_response": "Ожидание ответа",
        "waiting_third_party": "Ожидание третьей стороны",
        "on_hold": "Отложен",
        "resolved": "Решён",
        "closed": "Закрыт"
    }
    return labels.get(st, st)


def get_priority_label(pr: str) -> str:
    """Get human-readable priority label."""
    labels = {
        "low": "Низкий",
        "medium": "Средний",
        "high": "Высокий",
        "urgent": "Срочный",
        "critical": "Критический"
    }
    return labels.get(pr, pr)


# === CATEGORIES ===

@router.get(
    "/",
    response_model=List[TicketCategoryRead],
    status_code=status.HTTP_200_OK,
)
def list_categories(
    session: SessionDep,
    current_user: User = Depends(get_current_user),
    include_inactive: bool = Query(False),
) -> List[TicketCategoryRead]:
    """Get all ticket categories."""
    statement = select(TicketCategory)
    if not include_inactive:
        statement = statement.where(TicketCategory.is_active == True)
    statement = statement.order_by(TicketCategory.sort_order, TicketCategory.name)

    categories = session.exec(statement).all()
    result = []

    for cat in categories:
        cat_data = TicketCategoryRead.model_validate(cat)
        # Count tickets in category
        count = session.exec(
            select(func.count(Ticket.id)).where(
                Ticket.category_id == cat.id,
                Ticket.is_deleted == False
            )
        ).one()
        cat_data.tickets_count = count
        result.append(cat_data)

    return result


@router.post(
    "/",
    response_model=TicketCategoryRead,
    status_code=status.HTTP_201_CREATED,
)
def create_category(
    category_data: TicketCategoryCreate,
    session: SessionDep,
    current_user: User = Depends(get_current_user),
) -> TicketCategoryRead:
    """Create a new ticket category (staff only)."""
    if not is_staff(current_user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only staff can create categories"
        )

    category = TicketCategory(
        name=category_data.name,
        description=category_data.description,
        color=category_data.color,
        icon=category_data.icon,
        parent_id=category_data.parent_id,
        sort_order=category_data.sort_order,
    )

    session.add(category)
    session.commit()
    session.refresh(category)

    result = TicketCategoryRead.model_validate(category)
    result.tickets_count = 0
    return result


@router.get(
    "/{category_id}",
    response_model=TicketCategoryRead,
    status_code=status.HTTP_200_OK,
)
def get_category(
    category_id: UUID,
    session: SessionDep,
    current_user: User = Depends(get_current_user),
) -> TicketCategoryRead:
    """Get a specific category by ID."""
    category = session.get(TicketCategory, category_id)
    if not category:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Category not found",
        )

    result = TicketCategoryRead.model_validate(category)
    count = session.exec(
        select(func.count(Ticket.id)).where(
            Ticket.category_id == category.id,
            Ticket.is_deleted == False
        )
    ).one()
    result.tickets_count = count
    return result


@router.put(
    "/{category_id}",
    response_model=TicketCategoryRead,
    status_code=status.HTTP_200_OK,
)
def update_category(
    category_id: UUID,
    category_update: TicketCategoryUpdate,
    session: SessionDep,
    current_user: User = Depends(get_current_user),
) -> TicketCategoryRead:
    """Update a ticket category (staff only)."""
    if not is_staff(current_user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only staff can update categories"
        )

    category = session.get(TicketCategory, category_id)
    if not category:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Category not found",
        )

    if category_update.name is not None:
        category.name = category_update.name
    if category_update.description is not None:
        category.description = category_update.description
    if category_update.color is not None:
        category.color = category_update.color
    if category_update.icon is not None:
        category.icon = category_update.icon
    if category_update.parent_id is not None:
        category.parent_id = category_update.parent_id
    if category_update.sort_order is not None:
        category.sort_order = category_update.sort_order
    if category_update.is_active is not None:
        category.is_active = category_update.is_active

    category.touch()
    session.add(category)
    session.commit()
    session.refresh(category)

    result = TicketCategoryRead.model_validate(category)
    count = session.exec(
        select(func.count(Ticket.id)).where(
            Ticket.category_id == category.id,
            Ticket.is_deleted == False
        )
    ).one()
    result.tickets_count = count
    return result


@router.delete(
    "/{category_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def delete_category(
    category_id: UUID,
    session: SessionDep,
    current_user: User = Depends(get_current_user),
):
    """Delete a ticket category (staff only). Sets is_active to False."""
    if not is_staff(current_user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only staff can delete categories"
        )

    category = session.get(TicketCategory, category_id)
    if not category:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Category not found",
        )

    # Soft delete - just deactivate
    category.is_active = False
    category.touch()
    session.add(category)
    session.commit()

    return None

