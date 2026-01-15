from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field


class PushSubscriptionCreate(BaseModel):
    """Create push subscription."""
    
    endpoint: str = Field(..., max_length=500)
    p256dh: str = Field(..., max_length=100, description="Encryption key")
    auth: str = Field(..., max_length=50, description="Auth secret")


class PushSubscriptionRead(BaseModel):
    """Read push subscription."""
    
    id: UUID
    user_id: UUID
    endpoint: str
    is_active: bool
    created_at: datetime
    last_used_at: datetime | None
    
    model_config = {"from_attributes": True}

