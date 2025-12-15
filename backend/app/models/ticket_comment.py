from datetime import datetime
from typing import Optional
from uuid import UUID, uuid4

from sqlmodel import Field, SQLModel


class TicketComment(SQLModel, table=True):
    """Represents a comment on a ticket."""

    __tablename__ = "ticket_comments"

    id: UUID = Field(default_factory=uuid4, primary_key=True, index=True)
    ticket_id: UUID = Field(foreign_key="tickets.id", index=True)
    user_id: UUID = Field(foreign_key="users.id", index=True)
    content: str = Field(max_length=2000)
    created_at: datetime = Field(default_factory=datetime.utcnow, nullable=False)
    updated_at: datetime = Field(default_factory=datetime.utcnow, nullable=False)
    is_deleted: bool = Field(default=False, index=True)
    deleted_at: Optional[datetime] = None

    def touch(self):
        """Updates the updated_at timestamp."""
        self.updated_at = datetime.utcnow()

