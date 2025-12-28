"""Rate limiting configuration."""

from __future__ import annotations

import logging

from slowapi import Limiter
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address

from app.core.config import settings

logger = logging.getLogger(__name__)

# Create limiter instance
# Используем Redis для production (работает с несколькими инстансами)
# Fallback на memory:// если Redis недоступен
try:
    # Try to use Redis for rate limiting
    storage_uri = f"{settings.REDIS_URL}?db=2"  # Use separate DB for rate limiting
    limiter = Limiter(
        key_func=get_remote_address,
        storage_uri=storage_uri,
        default_limits=["1000/hour"],  # Общий лимит на случай, если забыли указать для endpoint
    )
    logger.info(f"Rate limiter configured with Redis: {storage_uri}")
except Exception as e:
    logger.warning(f"Failed to configure Redis for rate limiting: {e}. Using in-memory storage.")
    # Fallback to in-memory storage
    limiter = Limiter(
        key_func=get_remote_address,
        storage_uri="memory://",
        default_limits=["1000/hour"],
    )


def get_limiter() -> Limiter:
    """Get limiter instance."""
    return limiter

