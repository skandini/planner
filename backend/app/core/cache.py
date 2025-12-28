"""Redis-based cache for frequently accessed data."""

from __future__ import annotations

import json
import logging
from typing import Any, Optional

import redis
from redis.exceptions import ConnectionError, RedisError

from app.core.config import settings

logger = logging.getLogger(__name__)

# Redis connection pool
_redis_pool: Optional[redis.ConnectionPool] = None
_redis_client: Optional[redis.Redis] = None


def _get_redis_client() -> redis.Redis:
    """Get or create Redis client."""
    global _redis_client, _redis_pool
    
    if _redis_client is None:
        try:
            _redis_pool = redis.ConnectionPool.from_url(
                settings.REDIS_CACHE_URL,
                max_connections=50,
                decode_responses=True,
            )
            _redis_client = redis.Redis(connection_pool=_redis_pool)
            # Test connection
            _redis_client.ping()
            logger.info(f"Redis cache connected: {settings.REDIS_CACHE_URL}")
        except (ConnectionError, RedisError) as e:
            logger.warning(f"Failed to connect to Redis cache: {e}. Using fallback in-memory cache.")
            # Fallback to in-memory cache if Redis is unavailable
            return _InMemoryCache()
    
    return _redis_client


class _InMemoryCache:
    """Fallback in-memory cache when Redis is unavailable."""
    
    def __init__(self):
        self._cache: dict[str, Any] = {}
    
    def get(self, key: str) -> Optional[Any]:
        return self._cache.get(key)
    
    def set(self, key: str, value: Any, ex: Optional[int] = None) -> None:
        self._cache[key] = value
    
    def delete(self, key: str) -> None:
        self._cache.pop(key, None)
    
    def clear(self) -> None:
        self._cache.clear()


class RedisCache:
    """Redis-based cache with TTL support."""
    
    def __init__(self, default_ttl: int = 300):
        """
        Initialize cache.
        
        Args:
            default_ttl: Default time-to-live in seconds (default: 5 minutes)
        """
        self.default_ttl = default_ttl
        self._client = _get_redis_client()
    
    def get(self, key: str) -> Optional[Any]:
        """Get value from cache."""
        try:
            if isinstance(self._client, _InMemoryCache):
                return self._client.get(key)
            
            value = self._client.get(key)
            if value is None:
                return None
            
            # Try to deserialize JSON
            try:
                return json.loads(value)
            except (json.JSONDecodeError, TypeError):
                # If not JSON, return as string
                return value
        except (ConnectionError, RedisError) as e:
            logger.warning(f"Redis cache get error for key {key}: {e}")
            return None
    
    def set(self, key: str, value: Any, ttl: Optional[int] = None) -> None:
        """Set value in cache with TTL."""
        try:
            ttl = ttl or self.default_ttl
            
            if isinstance(self._client, _InMemoryCache):
                self._client.set(key, value, ex=ttl)
                return
            
            # Serialize to JSON if needed
            if isinstance(value, (dict, list)):
                serialized = json.dumps(value)
            else:
                serialized = str(value)
            
            self._client.setex(key, ttl, serialized)
        except (ConnectionError, RedisError) as e:
            logger.warning(f"Redis cache set error for key {key}: {e}")
    
    def delete(self, key: str) -> None:
        """Delete key from cache."""
        try:
            if isinstance(self._client, _InMemoryCache):
                self._client.delete(key)
                return
            
            self._client.delete(key)
        except (ConnectionError, RedisError) as e:
            logger.warning(f"Redis cache delete error for key {key}: {e}")
    
    def clear(self) -> None:
        """Clear all cache entries."""
        try:
            if isinstance(self._client, _InMemoryCache):
                self._client.clear()
                return
            
            # Clear all keys in the current database
            self._client.flushdb()
        except (ConnectionError, RedisError) as e:
            logger.warning(f"Redis cache clear error: {e}")
    
    def cleanup_expired(self) -> None:
        """Redis automatically handles TTL, so this is a no-op."""
        pass


# Global cache instance
_cache = RedisCache(default_ttl=300)  # 5 minutes default TTL


def get_cache() -> RedisCache:
    """Get global cache instance."""
    return _cache


def invalidate_user_cache(user_id: str | None) -> None:
    """Invalidate cache for a specific user."""
    if user_id:
        cache_key = f"user:{user_id}"
        _cache.delete(cache_key)
        logger.debug(f"Invalidated cache for user {user_id}")

