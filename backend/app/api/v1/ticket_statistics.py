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
    TicketStatistics, TicketStatusStats, TicketPriorityStats,
    TicketCategoryStats, TicketAssigneeStats, TicketBulkUpdate, TicketBulkResult
)
from app.models import TicketHistory, TicketHistoryAction

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


def add_ticket_history(
    session,
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


# === STATISTICS ===

@router.get(
    "/",
    response_model=TicketStatistics,
    status_code=status.HTTP_200_OK,
)
def get_ticket_statistics(
    session: SessionDep,
    current_user: User = Depends(get_current_user),
    date_from: Optional[datetime] = Query(None),
    date_to: Optional[datetime] = Query(None),
) -> TicketStatistics:
    """Get ticket statistics (staff only)."""
    if not is_staff(current_user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only staff can view statistics"
        )

    # Base query
    base_filter = Ticket.is_deleted == False
    if date_from:
        base_filter = and_(base_filter, Ticket.created_at >= date_from)
    if date_to:
        base_filter = and_(base_filter, Ticket.created_at <= date_to)

    # Total counts
    total = session.exec(select(func.count(Ticket.id)).where(base_filter)).one()

    open_count = session.exec(
        select(func.count(Ticket.id)).where(base_filter, Ticket.status == TicketStatus.OPEN)
    ).one()

    in_progress_count = session.exec(
        select(func.count(Ticket.id)).where(base_filter, Ticket.status == TicketStatus.IN_PROGRESS)
    ).one()

    resolved_count = session.exec(
        select(func.count(Ticket.id)).where(base_filter, Ticket.status == TicketStatus.RESOLVED)
    ).one()

    closed_count = session.exec(
        select(func.count(Ticket.id)).where(base_filter, Ticket.status == TicketStatus.CLOSED)
    ).one()

    sla_breach_count = session.exec(
        select(func.count(Ticket.id)).where(base_filter, Ticket.sla_breach == True)
    ).one()

    # By status
    by_status = []
    for st in [TicketStatus.OPEN, TicketStatus.IN_PROGRESS, TicketStatus.WAITING_RESPONSE,
               TicketStatus.WAITING_THIRD_PARTY, TicketStatus.ON_HOLD,
               TicketStatus.RESOLVED, TicketStatus.CLOSED]:
        count = session.exec(
            select(func.count(Ticket.id)).where(base_filter, Ticket.status == st)
        ).one()
        by_status.append(TicketStatusStats(status=st, count=count, label=get_status_label(st)))

    # By priority
    by_priority = []
    for pr in [TicketPriority.LOW, TicketPriority.MEDIUM, TicketPriority.HIGH,
               TicketPriority.URGENT, TicketPriority.CRITICAL]:
        count = session.exec(
            select(func.count(Ticket.id)).where(base_filter, Ticket.priority == pr)
        ).one()
        by_priority.append(TicketPriorityStats(priority=pr, count=count, label=get_priority_label(pr)))

    # By category
    by_category = []
    categories = session.exec(select(TicketCategory).where(TicketCategory.is_active == True)).all()
    for cat in categories:
        count = session.exec(
            select(func.count(Ticket.id)).where(base_filter, Ticket.category_id == cat.id)
        ).one()
        by_category.append(TicketCategoryStats(
            category_id=cat.id, category_name=cat.name, count=count
        ))
    # Add uncategorized
    uncategorized = session.exec(
        select(func.count(Ticket.id)).where(base_filter, Ticket.category_id == None)
    ).one()
    by_category.append(TicketCategoryStats(
        category_id=None, category_name="Без категории", count=uncategorized
    ))

    # By assignee
    by_assignee = []
    staff_users = session.exec(
        select(User).where(User.role.in_(["admin", "it"]), User.is_active == True)
    ).all()
    for user in staff_users:
        user_open = session.exec(
            select(func.count(Ticket.id)).where(
                base_filter, Ticket.assigned_to == user.id, Ticket.status == TicketStatus.OPEN
            )
        ).one()
        user_in_progress = session.exec(
            select(func.count(Ticket.id)).where(
                base_filter, Ticket.assigned_to == user.id, Ticket.status == TicketStatus.IN_PROGRESS
            )
        ).one()
        user_resolved = session.exec(
            select(func.count(Ticket.id)).where(
                base_filter, Ticket.assigned_to == user.id, Ticket.status == TicketStatus.RESOLVED
            )
        ).one()
        user_total = session.exec(
            select(func.count(Ticket.id)).where(base_filter, Ticket.assigned_to == user.id)
        ).one()
        by_assignee.append(TicketAssigneeStats(
            user_id=user.id,
            user_name=user.full_name or user.email,
            open_count=user_open,
            in_progress_count=user_in_progress,
            resolved_count=user_resolved,
            total_count=user_total
        ))
    # Unassigned
    unassigned = session.exec(
        select(func.count(Ticket.id)).where(base_filter, Ticket.assigned_to == None)
    ).one()
    by_assignee.append(TicketAssigneeStats(
        user_id=None,
        user_name="Не назначен",
        open_count=unassigned,
        in_progress_count=0,
        resolved_count=0,
        total_count=unassigned
    ))

    # Time-based stats
    now = datetime.utcnow()
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    week_start = today_start - timedelta(days=now.weekday())
    month_start = today_start.replace(day=1)

    created_today = session.exec(
        select(func.count(Ticket.id)).where(
            Ticket.is_deleted == False, Ticket.created_at >= today_start
        )
    ).one()

    created_this_week = session.exec(
        select(func.count(Ticket.id)).where(
            Ticket.is_deleted == False, Ticket.created_at >= week_start
        )
    ).one()

    created_this_month = session.exec(
        select(func.count(Ticket.id)).where(
            Ticket.is_deleted == False, Ticket.created_at >= month_start
        )
    ).one()

    # Average resolution time (for resolved tickets)
    resolved_tickets = session.exec(
        select(Ticket).where(
            base_filter,
            Ticket.resolved_at != None
        )
    ).all()

    avg_resolution_time = None
    if resolved_tickets:
        total_hours = sum(
            (t.resolved_at - t.created_at).total_seconds() / 3600
            for t in resolved_tickets if t.resolved_at
        )
        avg_resolution_time = round(total_hours / len(resolved_tickets), 2)

    # Average first response time
    responded_tickets = session.exec(
        select(Ticket).where(
            base_filter,
            Ticket.first_response_at != None
        )
    ).all()

    avg_first_response_time = None
    if responded_tickets:
        total_hours = sum(
            (t.first_response_at - t.created_at).total_seconds() / 3600
            for t in responded_tickets if t.first_response_at
        )
        avg_first_response_time = round(total_hours / len(responded_tickets), 2)

    return TicketStatistics(
        total_tickets=total,
        open_tickets=open_count,
        in_progress_tickets=in_progress_count,
        resolved_tickets=resolved_count,
        closed_tickets=closed_count,
        avg_resolution_time_hours=avg_resolution_time,
        avg_first_response_time_hours=avg_first_response_time,
        sla_breach_count=sla_breach_count,
        by_status=by_status,
        by_priority=by_priority,
        by_category=by_category,
        by_assignee=by_assignee,
        created_today=created_today,
        created_this_week=created_this_week,
        created_this_month=created_this_month
    )


# === BULK OPERATIONS ===

@router.post(
    "/bulk-update",
    response_model=TicketBulkResult,
    status_code=status.HTTP_200_OK,
)
def bulk_update_tickets(
    bulk_data: TicketBulkUpdate,
    session: SessionDep,
    current_user: User = Depends(get_current_user),
) -> TicketBulkResult:
    """Bulk update multiple tickets (staff only)."""
    if not is_staff(current_user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only staff can perform bulk operations"
        )

    updated_count = 0
    failed_ids = []

    for ticket_id in bulk_data.ticket_ids:
        ticket = session.get(Ticket, ticket_id)
        if not ticket or ticket.is_deleted:
            failed_ids.append(ticket_id)
            continue

        try:
            if bulk_data.status:
                if ticket.status != bulk_data.status:
                    add_ticket_history(
                        session, ticket.id, current_user.id,
                        TicketHistoryAction.STATUS_CHANGED,
                        "status", get_status_label(ticket.status), get_status_label(bulk_data.status)
                    )
                    ticket.status = bulk_data.status
                    if bulk_data.status == TicketStatus.RESOLVED and not ticket.resolved_at:
                        ticket.resolved_at = datetime.utcnow()
                    elif bulk_data.status == TicketStatus.CLOSED and not ticket.closed_at:
                        ticket.closed_at = datetime.utcnow()

            if bulk_data.priority:
                if ticket.priority != bulk_data.priority:
                    add_ticket_history(
                        session, ticket.id, current_user.id,
                        TicketHistoryAction.PRIORITY_CHANGED,
                        "priority", get_priority_label(ticket.priority), get_priority_label(bulk_data.priority)
                    )
                    ticket.priority = bulk_data.priority

            if bulk_data.assigned_to is not None:
                if ticket.assigned_to != bulk_data.assigned_to:
                    new_user = session.get(User, bulk_data.assigned_to) if bulk_data.assigned_to else None
                    add_ticket_history(
                        session, ticket.id, current_user.id,
                        TicketHistoryAction.ASSIGNED if bulk_data.assigned_to else TicketHistoryAction.UNASSIGNED,
                        "assigned_to", "предыдущий", new_user.full_name if new_user else "Не назначен"
                    )
                    ticket.assigned_to = bulk_data.assigned_to

            if bulk_data.category_id is not None:
                ticket.category_id = bulk_data.category_id

            ticket.touch()
            session.add(ticket)
            updated_count += 1
        except Exception:
            failed_ids.append(ticket_id)

    session.commit()

    return TicketBulkResult(
        updated_count=updated_count,
        failed_count=len(failed_ids),
        failed_ids=failed_ids
    )

