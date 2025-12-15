from datetime import datetime
from typing import Optional
from uuid import UUID, uuid4

from sqlmodel import Field, SQLModel


class TicketAttachment(SQLModel, table=True):
    """Represents an attachment on a ticket."""

    __tablename__ = "ticket_attachments"

    id: UUID = Field(default_factory=uuid4, primary_key=True, index=True)
    ticket_id: UUID = Field(foreign_key="tickets.id", index=True)
    uploaded_by: UUID = Field(foreign_key="users.id", index=True)
    original_filename: str = Field(max_length=255)
    file_path: str = Field(max_length=500)
    file_size: int = Field(ge=0)
    content_type: str = Field(max_length=100, default="application/octet-stream")
    created_at: datetime = Field(default_factory=datetime.utcnow, nullable=False)
    is_deleted: bool = Field(default=False, index=True)
    deleted_at: Optional[datetime] = None

