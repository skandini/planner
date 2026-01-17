from __future__ import annotations

from datetime import datetime
from typing import List, Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from app.models.ticket import TicketPriority, TicketStatus


class TicketBase(BaseModel):
    title: str = Field(max_length=255, min_length=1)
    description: str = Field(max_length=5000, min_length=1)
    priority: str = Field(default=TicketPriority.MEDIUM)
    category_id: Optional[UUID] = None
    tags: Optional[str] = None


class TicketCreate(TicketBase):
    # created_by is taken from current_user
    pass


class TicketUpdate(BaseModel):
    title: Optional[str] = Field(None, max_length=255, min_length=1)
    description: Optional[str] = Field(None, max_length=5000, min_length=1)
    status: Optional[str] = None
    priority: Optional[str] = None
    assigned_to: Optional[UUID] = None
    category_id: Optional[UUID] = None
    due_date: Optional[datetime] = None
    tags: Optional[str] = None
    sla_breach: Optional[bool] = None


class TicketRead(TicketBase):
    id: UUID
    status: str
    created_by: UUID
    assigned_to: Optional[UUID] = None
    due_date: Optional[datetime] = None
    first_response_at: Optional[datetime] = None
    sla_breach: bool = False
    created_at: datetime
    updated_at: datetime
    resolved_at: Optional[datetime] = None
    closed_at: Optional[datetime] = None
    # User info (will be populated by API)
    created_by_email: Optional[str] = None
    created_by_full_name: Optional[str] = None
    assigned_to_email: Optional[str] = None
    assigned_to_full_name: Optional[str] = None
    # Category info
    category_name: Optional[str] = None
    category_color: Optional[str] = None
    # Counts
    comments_count: int = 0
    attachments_count: int = 0
    internal_notes_count: int = 0  # Только для staff

    model_config = ConfigDict(from_attributes=True)


# === Ticket Category Schemas ===

class TicketCategoryBase(BaseModel):
    name: str = Field(max_length=100, min_length=1)
    description: Optional[str] = Field(None, max_length=500)
    color: str = Field(default="#6366f1", max_length=20)
    icon: Optional[str] = Field(None, max_length=50)
    parent_id: Optional[UUID] = None
    sort_order: int = 0


class TicketCategoryCreate(TicketCategoryBase):
    pass


class TicketCategoryUpdate(BaseModel):
    name: Optional[str] = Field(None, max_length=100, min_length=1)
    description: Optional[str] = Field(None, max_length=500)
    color: Optional[str] = Field(None, max_length=20)
    icon: Optional[str] = Field(None, max_length=50)
    parent_id: Optional[UUID] = None
    sort_order: Optional[int] = None
    is_active: Optional[bool] = None


class TicketCategoryRead(TicketCategoryBase):
    id: UUID
    is_active: bool
    created_at: datetime
    updated_at: datetime
    tickets_count: int = 0  # Количество тикетов в категории

    model_config = ConfigDict(from_attributes=True)


# === Ticket History Schemas ===

class TicketHistoryRead(BaseModel):
    id: UUID
    ticket_id: UUID
    user_id: UUID
    action: str
    field_name: Optional[str] = None
    old_value: Optional[str] = None
    new_value: Optional[str] = None
    details: Optional[str] = None
    created_at: datetime
    # User info
    user_email: Optional[str] = None
    user_full_name: Optional[str] = None
    user_avatar_url: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


# === Internal Note Schemas ===

class TicketInternalNoteBase(BaseModel):
    content: str = Field(max_length=5000, min_length=1)
    is_pinned: bool = False


class TicketInternalNoteCreate(TicketInternalNoteBase):
    pass


class TicketInternalNoteUpdate(BaseModel):
    content: Optional[str] = Field(None, max_length=5000, min_length=1)
    is_pinned: Optional[bool] = None


class TicketInternalNoteRead(TicketInternalNoteBase):
    id: UUID
    ticket_id: UUID
    user_id: UUID
    created_at: datetime
    updated_at: datetime
    # User info
    user_email: Optional[str] = None
    user_full_name: Optional[str] = None
    user_avatar_url: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


# === Ticket Statistics Schemas ===

class TicketStatusStats(BaseModel):
    status: str
    count: int
    label: str


class TicketPriorityStats(BaseModel):
    priority: str
    count: int
    label: str


class TicketCategoryStats(BaseModel):
    category_id: Optional[UUID]
    category_name: str
    count: int


class TicketAssigneeStats(BaseModel):
    user_id: Optional[UUID]
    user_name: str
    open_count: int
    in_progress_count: int
    resolved_count: int
    total_count: int


class TicketStatistics(BaseModel):
    total_tickets: int
    open_tickets: int
    in_progress_tickets: int
    resolved_tickets: int
    closed_tickets: int
    avg_resolution_time_hours: Optional[float] = None
    avg_first_response_time_hours: Optional[float] = None
    sla_breach_count: int
    by_status: List[TicketStatusStats]
    by_priority: List[TicketPriorityStats]
    by_category: List[TicketCategoryStats]
    by_assignee: List[TicketAssigneeStats]
    created_today: int
    created_this_week: int
    created_this_month: int


# === Bulk Operations Schemas ===

class TicketBulkUpdate(BaseModel):
    ticket_ids: List[UUID]
    status: Optional[str] = None
    priority: Optional[str] = None
    assigned_to: Optional[UUID] = None
    category_id: Optional[UUID] = None


class TicketBulkResult(BaseModel):
    updated_count: int
    failed_count: int
    failed_ids: List[UUID] = []

