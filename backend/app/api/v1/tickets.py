from __future__ import annotations

from datetime import datetime
from typing import List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import or_
from sqlmodel import select

from app.api.deps import get_current_user
from app.db import SessionDep
from app.models import Ticket, TicketAttachment, TicketComment, User
from app.models.ticket import TicketPriority, TicketStatus
from app.schemas.ticket import TicketCreate, TicketRead, TicketUpdate

router = APIRouter()


@router.get(
    "/",
    response_model=List[TicketRead],
    status_code=status.HTTP_200_OK,
)
def list_tickets(
    session: SessionDep,
    current_user: User = Depends(get_current_user),
    status_filter: Optional[str] = Query(None, alias="status"),
    priority_filter: Optional[str] = Query(None, alias="priority"),
    assigned_to_me: bool = Query(False),
    created_by_me: bool = Query(False),
) -> List[TicketRead]:
    """Get all tickets with optional filters."""
    # Проверка прав доступа к тикетам (админы и ИТ всегда имеют доступ)
    if not current_user.access_tickets and current_user.role not in ("admin", "it"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Tickets access denied"
        )
    statement = select(Ticket).where(Ticket.is_deleted == False)

    # Обычные сотрудники видят только свои тикеты (созданные ими или назначенные на них)
    if current_user.role not in ("admin", "it"):
        statement = statement.where(
            or_(
                Ticket.created_by == current_user.id,
                Ticket.assigned_to == current_user.id,
            )
        )

    # Apply filters
    if status_filter:
        statement = statement.where(Ticket.status == status_filter)
    if priority_filter:
        statement = statement.where(Ticket.priority == priority_filter)
    if assigned_to_me:
        statement = statement.where(Ticket.assigned_to == current_user.id)
    if created_by_me:
        statement = statement.where(Ticket.created_by == current_user.id)

    statement = statement.order_by(Ticket.created_at.desc())
    tickets = session.exec(statement).all()

    # Populate user info and counts
    result = []
    for ticket in tickets:
        ticket_data = TicketRead.model_validate(ticket)

        # Get creator info
        creator = session.get(User, ticket.created_by)
        if creator:
            ticket_data.created_by_email = creator.email
            ticket_data.created_by_full_name = creator.full_name

        # Get assignee info
        if ticket.assigned_to:
            assignee = session.get(User, ticket.assigned_to)
            if assignee:
                ticket_data.assigned_to_email = assignee.email
                ticket_data.assigned_to_full_name = assignee.full_name

        # Get counts
        comments_count = session.exec(
            select(TicketComment).where(
                TicketComment.ticket_id == ticket.id,
                TicketComment.is_deleted == False,
            )
        ).all()
        ticket_data.comments_count = len(comments_count)

        attachments_count = session.exec(
            select(TicketAttachment).where(
                TicketAttachment.ticket_id == ticket.id,
                TicketAttachment.is_deleted == False,
            )
        ).all()
        ticket_data.attachments_count = len(attachments_count)

        result.append(ticket_data)

    return result


@router.get(
    "/{ticket_id}",
    response_model=TicketRead,
    status_code=status.HTTP_200_OK,
)
def get_ticket(
    ticket_id: UUID,
    session: SessionDep,
    current_user: User = Depends(get_current_user),
) -> TicketRead:
    """Get a specific ticket by ID."""
    if not current_user.access_tickets and current_user.role not in ("admin", "it"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Tickets access denied"
        )
    ticket = session.get(Ticket, ticket_id)
    if not ticket or ticket.is_deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Ticket not found",
        )

    # Доступ: admin/it видят все, остальные — только свои/назначенные
    if current_user.role not in ("admin", "it"):
        if ticket.created_by != current_user.id and ticket.assigned_to != current_user.id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Access to ticket denied",
            )

    ticket_data = TicketRead.model_validate(ticket)

    # Get creator info
    creator = session.get(User, ticket.created_by)
    if creator:
        ticket_data.created_by_email = creator.email
        ticket_data.created_by_full_name = creator.full_name

    # Get assignee info
    if ticket.assigned_to:
        assignee = session.get(User, ticket.assigned_to)
        if assignee:
            ticket_data.assigned_to_email = assignee.email
            ticket_data.assigned_to_full_name = assignee.full_name

    # Get counts
    comments_count = session.exec(
        select(TicketComment).where(
            TicketComment.ticket_id == ticket.id,
            TicketComment.is_deleted == False,
        )
    ).all()
    ticket_data.comments_count = len(comments_count)

    attachments_count = session.exec(
        select(TicketAttachment).where(
            TicketAttachment.ticket_id == ticket.id,
            TicketAttachment.is_deleted == False,
        )
    ).all()
    ticket_data.attachments_count = len(attachments_count)

    return ticket_data


@router.post(
    "/",
    response_model=TicketRead,
    status_code=status.HTTP_201_CREATED,
)
def create_ticket(
    ticket_data: TicketCreate,
    session: SessionDep,
    current_user: User = Depends(get_current_user),
) -> TicketRead:
    """Create a new ticket."""
    ticket = Ticket(
        title=ticket_data.title,
        description=ticket_data.description,
        priority=ticket_data.priority,
        status=TicketStatus.OPEN,
        created_by=current_user.id,
    )

    session.add(ticket)
    session.commit()
    session.refresh(ticket)

    # Populate user info
    result = TicketRead.model_validate(ticket)
    result.created_by_email = current_user.email
    result.created_by_full_name = current_user.full_name
    result.comments_count = 0
    result.attachments_count = 0

    return result


@router.put(
    "/{ticket_id}",
    response_model=TicketRead,
    status_code=status.HTTP_200_OK,
)
def update_ticket(
    ticket_id: UUID,
    ticket_update: TicketUpdate,
    session: SessionDep,
    current_user: User = Depends(get_current_user),
) -> TicketRead:
    """Update a ticket."""
    if not current_user.access_tickets and current_user.role not in ("admin", "it"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Tickets access denied"
        )
    ticket = session.get(Ticket, ticket_id)
    if not ticket or ticket.is_deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Ticket not found",
        )

    # Доступ на обновление: admin/it или автор/исполнитель
    if current_user.role not in ("admin", "it"):
        if ticket.created_by != current_user.id and ticket.assigned_to != current_user.id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Not authorized to update this ticket",
            )

    # Update fields
    if ticket_update.title is not None:
        ticket.title = ticket_update.title
    if ticket_update.description is not None:
        ticket.description = ticket_update.description
    if ticket_update.status is not None:
        ticket.status = ticket_update.status
        # Update timestamps based on status
        if ticket.status == TicketStatus.RESOLVED and not ticket.resolved_at:
            ticket.resolved_at = datetime.utcnow()
        elif ticket.status == TicketStatus.CLOSED and not ticket.closed_at:
            ticket.closed_at = datetime.utcnow()
    if ticket_update.priority is not None:
        ticket.priority = ticket_update.priority
    if ticket_update.assigned_to is not None:
        ticket.assigned_to = ticket_update.assigned_to

    ticket.touch()
    session.add(ticket)
    session.commit()
    session.refresh(ticket)

    # Populate user info
    result = TicketRead.model_validate(ticket)
    creator = session.get(User, ticket.created_by)
    if creator:
        result.created_by_email = creator.email
        result.created_by_full_name = creator.full_name

    if ticket.assigned_to:
        assignee = session.get(User, ticket.assigned_to)
        if assignee:
            result.assigned_to_email = assignee.email
            result.assigned_to_full_name = assignee.full_name

    # Get counts
    comments_count = session.exec(
        select(TicketComment).where(
            TicketComment.ticket_id == ticket.id,
            TicketComment.is_deleted == False,
        )
    ).all()
    result.comments_count = len(comments_count)

    attachments_count = session.exec(
        select(TicketAttachment).where(
            TicketAttachment.ticket_id == ticket.id,
            TicketAttachment.is_deleted == False,
        )
    ).all()
    result.attachments_count = len(attachments_count)

    return result


@router.delete(
    "/{ticket_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def delete_ticket(
    ticket_id: UUID,
    session: SessionDep,
    current_user: User = Depends(get_current_user),
):
    """Soft delete a ticket."""
    if not current_user.access_tickets and current_user.role not in ("admin", "it"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Tickets access denied"
        )
    ticket = session.get(Ticket, ticket_id)
    if not ticket or ticket.is_deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Ticket not found",
        )

    # Доступ на удаление: admin/it или автор
    if current_user.role not in ("admin", "it") and ticket.created_by != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not authorized to delete this ticket",
        )

    # Soft delete
    ticket.is_deleted = True
    ticket.deleted_at = datetime.utcnow()

    session.add(ticket)
    session.commit()

    return None

