from __future__ import annotations

from datetime import datetime
from typing import List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, or_, and_
from sqlmodel import select

from app.api.deps import get_current_user
from app.db import SessionDep
from app.models import (
    Ticket, TicketAttachment, TicketComment, TicketCategory,
    TicketHistory, TicketHistoryAction, TicketInternalNote, User, Notification
)
from app.models.ticket import TicketPriority, TicketStatus
from app.schemas.ticket import (
    TicketCreate, TicketRead, TicketUpdate, TicketCategoryRead,
    TicketHistoryRead, TicketInternalNoteCreate, TicketInternalNoteRead,
    TicketInternalNoteUpdate
)

router = APIRouter()


def is_staff(user: User) -> bool:
    """Check if user is staff (admin or IT)."""
    return user.role in ("admin", "it")


def add_ticket_history(
    session: SessionDep,
    ticket_id: UUID,
    user_id: UUID,
    action: str,
    field_name: str = None,
    old_value: str = None,
    new_value: str = None,
    details: str = None
):
    """Add history entry for ticket change."""
    history = TicketHistory(
        ticket_id=ticket_id,
        user_id=user_id,
        action=action,
        field_name=field_name,
        old_value=old_value,
        new_value=new_value,
        details=details
    )
    session.add(history)


def get_status_label(status: str) -> str:
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
    return labels.get(status, status)


def get_priority_label(priority: str) -> str:
    """Get human-readable priority label."""
    labels = {
        "low": "Низкий",
        "medium": "Средний",
        "high": "Высокий",
        "urgent": "Срочный",
        "critical": "Критический"
    }
    return labels.get(priority, priority)


def create_ticket_notification(
    session,
    user_id: UUID,
    ticket_id: UUID,
    ticket_title: str,
    notification_type: str,
    message: str
):
    """Create a notification for ticket-related events."""
    type_titles = {
        "ticket_assigned": "Назначен тикет",
        "ticket_reassigned": "Переназначен тикет",
        "ticket_comment": "Новый комментарий",
        "ticket_status_changed": "Статус изменён",
    }
    notification = Notification(
        user_id=user_id,
        ticket_id=ticket_id,
        type=notification_type,
        title=type_titles.get(notification_type, "Тикет"),
        message=message
    )
    session.add(notification)


def populate_ticket_data(
    session: SessionDep,
    ticket: Ticket,
    current_user: User
) -> TicketRead:
    """Populate ticket with related data."""
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

    # Get category info
    if ticket.category_id:
        category = session.get(TicketCategory, ticket.category_id)
        if category:
            ticket_data.category_name = category.name
            ticket_data.category_color = category.color

    # Get counts
    comments_count = session.exec(
        select(func.count(TicketComment.id)).where(
            TicketComment.ticket_id == ticket.id,
            TicketComment.is_deleted == False,
        )
    ).one()
    ticket_data.comments_count = comments_count

    attachments_count = session.exec(
        select(func.count(TicketAttachment.id)).where(
            TicketAttachment.ticket_id == ticket.id,
            TicketAttachment.is_deleted == False,
        )
    ).one()
    ticket_data.attachments_count = attachments_count

    # Internal notes count (only for staff)
    if is_staff(current_user):
        notes_count = session.exec(
            select(func.count(TicketInternalNote.id)).where(
                TicketInternalNote.ticket_id == ticket.id,
                TicketInternalNote.is_deleted == False,
            )
        ).one()
        ticket_data.internal_notes_count = notes_count

    return ticket_data


# === TICKETS CRUD ===

@router.get(
    "/",
    response_model=List[TicketRead],
    status_code=status.HTTP_200_OK,
)
def list_tickets(
    session: SessionDep,
    current_user: User = Depends(get_current_user),
    # Basic filters
    status_filter: Optional[str] = Query(None, alias="status"),
    priority_filter: Optional[str] = Query(None, alias="priority"),
    category_id: Optional[UUID] = Query(None),
    assigned_to_me: bool = Query(False),
    created_by_me: bool = Query(False),
    unassigned: bool = Query(False),
    # Search
    search: Optional[str] = Query(None, min_length=2, max_length=100),
    # Date filters
    created_from: Optional[datetime] = Query(None),
    created_to: Optional[datetime] = Query(None),
    due_before: Optional[datetime] = Query(None),
    # Special filters
    sla_breach: Optional[bool] = Query(None),
    has_attachments: Optional[bool] = Query(None),
    # Pagination
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    # Sorting
    sort_by: str = Query("created_at", pattern="^(created_at|updated_at|priority|status|due_date)$"),
    sort_order: str = Query("desc", pattern="^(asc|desc)$"),
) -> List[TicketRead]:
    """Get all tickets with advanced filters."""
    # Check access
    if not current_user.access_tickets and not is_staff(current_user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Tickets access denied"
        )

    statement = select(Ticket).where(Ticket.is_deleted == False)

    # Regular users can only see their own tickets
    if not is_staff(current_user):
        statement = statement.where(
            or_(
                Ticket.created_by == current_user.id,
                Ticket.assigned_to == current_user.id,
            )
        )

    # Apply filters
    if status_filter:
        # Support multiple statuses separated by comma
        statuses = status_filter.split(",")
        statement = statement.where(Ticket.status.in_(statuses))
    if priority_filter:
        priorities = priority_filter.split(",")
        statement = statement.where(Ticket.priority.in_(priorities))
    if category_id:
        statement = statement.where(Ticket.category_id == category_id)
    if assigned_to_me:
        statement = statement.where(Ticket.assigned_to == current_user.id)
    if created_by_me:
        statement = statement.where(Ticket.created_by == current_user.id)
    if unassigned:
        statement = statement.where(Ticket.assigned_to == None)

    # Search in title and description
    if search:
        search_pattern = f"%{search}%"
        statement = statement.where(
            or_(
                Ticket.title.ilike(search_pattern),
                Ticket.description.ilike(search_pattern),
                Ticket.tags.ilike(search_pattern) if Ticket.tags else False,
            )
        )

    # Date filters
    if created_from:
        statement = statement.where(Ticket.created_at >= created_from)
    if created_to:
        statement = statement.where(Ticket.created_at <= created_to)
    if due_before:
        statement = statement.where(Ticket.due_date <= due_before)

    # Special filters
    if sla_breach is not None:
        statement = statement.where(Ticket.sla_breach == sla_breach)
    if has_attachments is not None:
        if has_attachments:
            # Subquery for tickets with attachments
            subquery = select(TicketAttachment.ticket_id).where(
                TicketAttachment.is_deleted == False
            ).distinct()
            statement = statement.where(Ticket.id.in_(subquery))
        else:
            subquery = select(TicketAttachment.ticket_id).where(
                TicketAttachment.is_deleted == False
            ).distinct()
            statement = statement.where(Ticket.id.notin_(subquery))

    # Sorting
    sort_column = getattr(Ticket, sort_by)
    if sort_order == "desc":
        statement = statement.order_by(sort_column.desc())
    else:
        statement = statement.order_by(sort_column.asc())

    # Pagination
    statement = statement.offset(skip).limit(limit)

    tickets = session.exec(statement).all()

    # Populate ticket data
    return [populate_ticket_data(session, ticket, current_user) for ticket in tickets]


@router.get(
    "/count",
    status_code=status.HTTP_200_OK,
)
def count_tickets(
    session: SessionDep,
    current_user: User = Depends(get_current_user),
    status_filter: Optional[str] = Query(None, alias="status"),
    priority_filter: Optional[str] = Query(None, alias="priority"),
    category_id: Optional[UUID] = Query(None),
    assigned_to_me: bool = Query(False),
    unassigned: bool = Query(False),
    search: Optional[str] = Query(None, min_length=2, max_length=100),
) -> dict:
    """Get count of tickets matching filters."""
    if not current_user.access_tickets and not is_staff(current_user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Tickets access denied"
        )

    statement = select(func.count(Ticket.id)).where(Ticket.is_deleted == False)

    if not is_staff(current_user):
        statement = statement.where(
            or_(
                Ticket.created_by == current_user.id,
                Ticket.assigned_to == current_user.id,
            )
        )

    if status_filter:
        statuses = status_filter.split(",")
        statement = statement.where(Ticket.status.in_(statuses))
    if priority_filter:
        priorities = priority_filter.split(",")
        statement = statement.where(Ticket.priority.in_(priorities))
    if category_id:
        statement = statement.where(Ticket.category_id == category_id)
    if assigned_to_me:
        statement = statement.where(Ticket.assigned_to == current_user.id)
    if unassigned:
        statement = statement.where(Ticket.assigned_to == None)
    if search:
        search_pattern = f"%{search}%"
        statement = statement.where(
            or_(
                Ticket.title.ilike(search_pattern),
                Ticket.description.ilike(search_pattern),
            )
        )

    count = session.exec(statement).one()
    return {"count": count}


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
    if not current_user.access_tickets and not is_staff(current_user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Tickets access denied"
        )
    ticket = session.get(Ticket, ticket_id)
    if not ticket or ticket.is_deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Ticket not found",
        )

    # Access check: staff can see all, others only own/assigned
    if not is_staff(current_user):
        if ticket.created_by != current_user.id and ticket.assigned_to != current_user.id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Access to ticket denied",
            )

    return populate_ticket_data(session, ticket, current_user)


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
        category_id=ticket_data.category_id,
        tags=ticket_data.tags,
        status=TicketStatus.OPEN,
        created_by=current_user.id,
    )

    session.add(ticket)
    session.commit()
    session.refresh(ticket)

    # Add history entry
    add_ticket_history(
        session, ticket.id, current_user.id,
        TicketHistoryAction.CREATED,
        details=f"Тикет создан с приоритетом {get_priority_label(ticket.priority)}"
    )
    session.commit()

    return populate_ticket_data(session, ticket, current_user)


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
    if not current_user.access_tickets and not is_staff(current_user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Tickets access denied"
        )
    ticket = session.get(Ticket, ticket_id)
    if not ticket or ticket.is_deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Ticket not found",
        )

    # Access check
    if not is_staff(current_user):
        if ticket.created_by != current_user.id and ticket.assigned_to != current_user.id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Not authorized to update this ticket",
            )

    # Track changes for history
    if ticket_update.title is not None and ticket_update.title != ticket.title:
        add_ticket_history(
            session, ticket.id, current_user.id,
            TicketHistoryAction.TITLE_CHANGED,
            "title", ticket.title, ticket_update.title
        )
        ticket.title = ticket_update.title

    if ticket_update.description is not None and ticket_update.description != ticket.description:
        add_ticket_history(
            session, ticket.id, current_user.id,
            TicketHistoryAction.DESCRIPTION_CHANGED,
            "description", "(изменено)", "(обновлено)"
        )
        ticket.description = ticket_update.description

    if ticket_update.status is not None and ticket_update.status != ticket.status:
        old_status = ticket.status
        new_status = ticket_update.status
        add_ticket_history(
            session, ticket.id, current_user.id,
            TicketHistoryAction.STATUS_CHANGED,
            "status", get_status_label(old_status), get_status_label(new_status)
        )
        ticket.status = new_status
        
        # Update timestamps based on status
        if ticket.status == TicketStatus.RESOLVED and not ticket.resolved_at:
            ticket.resolved_at = datetime.utcnow()
        elif ticket.status == TicketStatus.CLOSED and not ticket.closed_at:
            ticket.closed_at = datetime.utcnow()
        
        # Notify ticket creator about status change (if not the one changing it)
        if ticket.created_by and ticket.created_by != current_user.id:
            changer_name = current_user.full_name or current_user.email
            create_ticket_notification(
                session, ticket.created_by, ticket.id, ticket.title,
                "ticket_status_changed",
                f"{changer_name} изменил статус тикета «{ticket.title}» на «{get_status_label(new_status)}»"
            )

    if ticket_update.priority is not None and ticket_update.priority != ticket.priority:
        old_priority = ticket.priority
        add_ticket_history(
            session, ticket.id, current_user.id,
            TicketHistoryAction.PRIORITY_CHANGED,
            "priority", get_priority_label(old_priority), get_priority_label(ticket_update.priority)
        )
        ticket.priority = ticket_update.priority

    if ticket_update.assigned_to is not None:
        old_assigned = ticket.assigned_to
        new_assigned = ticket_update.assigned_to

        if old_assigned != new_assigned:
            # Get user names for history
            old_name = None
            new_name = None
            if old_assigned:
                old_user = session.get(User, old_assigned)
                old_name = old_user.full_name or old_user.email if old_user else str(old_assigned)
            if new_assigned:
                new_user = session.get(User, new_assigned)
                new_name = new_user.full_name or new_user.email if new_user else str(new_assigned)

            if old_assigned is None and new_assigned:
                action = TicketHistoryAction.ASSIGNED
            elif old_assigned and new_assigned is None:
                action = TicketHistoryAction.UNASSIGNED
            else:
                action = TicketHistoryAction.REASSIGNED

            add_ticket_history(
                session, ticket.id, current_user.id,
                action, "assigned_to",
                old_name or "Не назначен",
                new_name or "Не назначен"
            )
            ticket.assigned_to = new_assigned

            # Send notification to new assignee
            if new_assigned and new_assigned != current_user.id:
                assigner_name = current_user.full_name or current_user.email
                notif_type = "ticket_assigned" if action == TicketHistoryAction.ASSIGNED else "ticket_reassigned"
                create_ticket_notification(
                    session, new_assigned, ticket.id, ticket.title,
                    notif_type,
                    f"{assigner_name} назначил вам тикет: {ticket.title}"
                )

            # Track first response time
            if not ticket.first_response_at and is_staff(current_user):
                ticket.first_response_at = datetime.utcnow()

    if ticket_update.category_id is not None and ticket_update.category_id != ticket.category_id:
        old_cat_name = None
        new_cat_name = None
        if ticket.category_id:
            old_cat = session.get(TicketCategory, ticket.category_id)
            old_cat_name = old_cat.name if old_cat else None
        if ticket_update.category_id:
            new_cat = session.get(TicketCategory, ticket_update.category_id)
            new_cat_name = new_cat.name if new_cat else None

        add_ticket_history(
            session, ticket.id, current_user.id,
            TicketHistoryAction.CATEGORY_CHANGED,
            "category_id",
            old_cat_name or "Без категории",
            new_cat_name or "Без категории"
        )
        ticket.category_id = ticket_update.category_id

    if ticket_update.due_date is not None:
        ticket.due_date = ticket_update.due_date

    if ticket_update.tags is not None:
        ticket.tags = ticket_update.tags

    if ticket_update.sla_breach is not None:
        ticket.sla_breach = ticket_update.sla_breach

    ticket.touch()
    session.add(ticket)
    session.commit()
    session.refresh(ticket)

    return populate_ticket_data(session, ticket, current_user)


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
    if not current_user.access_tickets and not is_staff(current_user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Tickets access denied"
        )
    ticket = session.get(Ticket, ticket_id)
    if not ticket or ticket.is_deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Ticket not found",
        )

    # Only staff or creator can delete
    if not is_staff(current_user) and ticket.created_by != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not authorized to delete this ticket",
        )

    ticket.is_deleted = True
    ticket.deleted_at = datetime.utcnow()

    session.add(ticket)
    session.commit()

    return None


# === TICKET HISTORY ===

@router.get(
    "/{ticket_id}/history",
    response_model=List[TicketHistoryRead],
    status_code=status.HTTP_200_OK,
)
def get_ticket_history(
    ticket_id: UUID,
    session: SessionDep,
    current_user: User = Depends(get_current_user),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
) -> List[TicketHistoryRead]:
    """Get ticket change history (staff only)."""
    if not is_staff(current_user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only staff can view ticket history"
        )

    ticket = session.get(Ticket, ticket_id)
    if not ticket or ticket.is_deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Ticket not found",
        )

    statement = (
        select(TicketHistory)
        .where(TicketHistory.ticket_id == ticket_id)
        .order_by(TicketHistory.created_at.desc())
        .offset(skip)
        .limit(limit)
    )

    history_entries = session.exec(statement).all()
    result = []

    for entry in history_entries:
        entry_data = TicketHistoryRead.model_validate(entry)
        user = session.get(User, entry.user_id)
        if user:
            entry_data.user_email = user.email
            entry_data.user_full_name = user.full_name
            entry_data.user_avatar_url = user.avatar_url
        result.append(entry_data)

    return result


# === INTERNAL NOTES ===

@router.get(
    "/{ticket_id}/internal-notes",
    response_model=List[TicketInternalNoteRead],
    status_code=status.HTTP_200_OK,
)
def get_internal_notes(
    ticket_id: UUID,
    session: SessionDep,
    current_user: User = Depends(get_current_user),
) -> List[TicketInternalNoteRead]:
    """Get internal notes for a ticket (staff only)."""
    if not is_staff(current_user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only staff can view internal notes"
        )

    ticket = session.get(Ticket, ticket_id)
    if not ticket or ticket.is_deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Ticket not found",
        )

    statement = (
        select(TicketInternalNote)
        .where(
            TicketInternalNote.ticket_id == ticket_id,
            TicketInternalNote.is_deleted == False
        )
        .order_by(TicketInternalNote.is_pinned.desc(), TicketInternalNote.created_at.desc())
    )

    notes = session.exec(statement).all()
    result = []

    for note in notes:
        note_data = TicketInternalNoteRead.model_validate(note)
        user = session.get(User, note.user_id)
        if user:
            note_data.user_email = user.email
            note_data.user_full_name = user.full_name
            note_data.user_avatar_url = user.avatar_url
        result.append(note_data)

    return result


@router.post(
    "/{ticket_id}/internal-notes",
    response_model=TicketInternalNoteRead,
    status_code=status.HTTP_201_CREATED,
)
def create_internal_note(
    ticket_id: UUID,
    note_data: TicketInternalNoteCreate,
    session: SessionDep,
    current_user: User = Depends(get_current_user),
) -> TicketInternalNoteRead:
    """Create an internal note (staff only)."""
    if not is_staff(current_user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only staff can create internal notes"
        )

    ticket = session.get(Ticket, ticket_id)
    if not ticket or ticket.is_deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Ticket not found",
        )

    note = TicketInternalNote(
        ticket_id=ticket_id,
        user_id=current_user.id,
        content=note_data.content,
        is_pinned=note_data.is_pinned,
    )

    session.add(note)

    # Add history entry
    add_ticket_history(
        session, ticket_id, current_user.id,
        TicketHistoryAction.INTERNAL_NOTE_ADDED,
        details="Добавлена внутренняя заметка"
    )

    session.commit()
    session.refresh(note)

    result = TicketInternalNoteRead.model_validate(note)
    result.user_email = current_user.email
    result.user_full_name = current_user.full_name
    result.user_avatar_url = current_user.avatar_url

    return result


@router.put(
    "/{ticket_id}/internal-notes/{note_id}",
    response_model=TicketInternalNoteRead,
    status_code=status.HTTP_200_OK,
)
def update_internal_note(
    ticket_id: UUID,
    note_id: UUID,
    note_update: TicketInternalNoteUpdate,
    session: SessionDep,
    current_user: User = Depends(get_current_user),
) -> TicketInternalNoteRead:
    """Update an internal note (staff only, own notes)."""
    if not is_staff(current_user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only staff can update internal notes"
        )

    note = session.get(TicketInternalNote, note_id)
    if not note or note.is_deleted or note.ticket_id != ticket_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Internal note not found",
        )

    # Only author or admin can edit
    if note.user_id != current_user.id and current_user.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Can only edit your own notes",
        )

    if note_update.content is not None:
        note.content = note_update.content
    if note_update.is_pinned is not None:
        note.is_pinned = note_update.is_pinned

    note.touch()
    session.add(note)
    session.commit()
    session.refresh(note)

    result = TicketInternalNoteRead.model_validate(note)
    user = session.get(User, note.user_id)
    if user:
        result.user_email = user.email
        result.user_full_name = user.full_name
        result.user_avatar_url = user.avatar_url

    return result


@router.delete(
    "/{ticket_id}/internal-notes/{note_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def delete_internal_note(
    ticket_id: UUID,
    note_id: UUID,
    session: SessionDep,
    current_user: User = Depends(get_current_user),
):
    """Delete an internal note (staff only)."""
    if not is_staff(current_user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only staff can delete internal notes"
        )

    note = session.get(TicketInternalNote, note_id)
    if not note or note.is_deleted or note.ticket_id != ticket_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Internal note not found",
        )

    # Only author or admin can delete
    if note.user_id != current_user.id and current_user.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Can only delete your own notes",
        )

    note.is_deleted = True
    note.deleted_at = datetime.utcnow()

    session.add(note)
    session.commit()

    return None
