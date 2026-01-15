from __future__ import annotations

from datetime import datetime
from typing import Optional
from uuid import UUID, uuid4

from sqlmodel import Field, SQLModel


class PushSubscription(SQLModel, table=True):
    """Web Push subscription for browser notifications."""

    __tablename__ = "push_subscriptions"

    id: UUID = Field(default_factory=uuid4, primary_key=True, index=True)
    user_id: UUID = Field(foreign_key="users.id", nullable=False, index=True)
    
    # Push subscription info
    endpoint: str = Field(max_length=500, nullable=False)
    p256dh: str = Field(max_length=100, nullable=False)  # Encryption key
    auth: str = Field(max_length=50, nullable=False)  # Auth secret
    
    # Metadata
    user_agent: Optional[str] = Field(default=None, max_length=500)
    ip_address: Optional[str] = Field(default=None, max_length=50)
    is_active: bool = Field(default=True, index=True)
    
    created_at: datetime = Field(default_factory=datetime.utcnow, nullable=False)
    last_used_at: Optional[datetime] = Field(default=None, nullable=True)

