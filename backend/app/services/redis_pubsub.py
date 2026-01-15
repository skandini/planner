"""
Redis Pub/Sub service for real-time notifications.
Listens to Redis channels and broadcasts to WebSocket clients.
"""

import asyncio
import json
import logging
from typing import Optional
from uuid import UUID

import redis.asyncio as aioredis
from redis.asyncio.client import PubSub

from app.core.config import settings
from app.services.websocket_manager import manager

logger = logging.getLogger(__name__)


class RedisPubSubService:
    """Redis Pub/Sub service for real-time notifications."""

    def __init__(self):
        self.redis: Optional[aioredis.Redis] = None
        self.pubsub: Optional[PubSub] = None
        self._listener_task: Optional[asyncio.Task] = None

    async def connect(self):
        """Connect to Redis and subscribe to notifications channel."""
        try:
            self.redis = await aioredis.from_url(
                settings.REDIS_URL,
                encoding="utf-8",
                decode_responses=True
            )
            self.pubsub = self.redis.pubsub()
            
            # Subscribe to the notifications channel
            await self.pubsub.subscribe("notifications")
            
            logger.info("Redis Pub/Sub connected and subscribed to 'notifications' channel")
            
            # Start listener task
            self._listener_task = asyncio.create_task(self._listen())
            
        except Exception as e:
            logger.error(f"Failed to connect to Redis Pub/Sub: {e}")
            raise

    async def disconnect(self):
        """Disconnect from Redis Pub/Sub."""
        if self._listener_task:
            self._listener_task.cancel()
            try:
                await self._listener_task
            except asyncio.CancelledError:
                pass
        
        if self.pubsub:
            await self.pubsub.unsubscribe("notifications")
            await self.pubsub.close()
        
        if self.redis:
            await self.redis.close()
        
        logger.info("Redis Pub/Sub disconnected")

    async def _listen(self):
        """Listen to Redis Pub/Sub messages and broadcast to WebSocket clients."""
        logger.info("Starting Redis Pub/Sub listener...")
        
        try:
            async for message in self.pubsub.listen():
                if message["type"] == "message":
                    try:
                        data = json.loads(message["data"])
                        user_id = UUID(data.get("user_id"))
                        
                        # Send to specific user via WebSocket
                        await manager.send_personal_message(
                            message={
                                "type": "notification",
                                "data": data
                            },
                            user_id=user_id
                        )
                        
                        logger.info(f"Notification broadcasted to user {user_id} via WebSocket")
                        
                    except Exception as e:
                        logger.error(f"Error processing Redis message: {e}", exc_info=True)
        
        except asyncio.CancelledError:
            logger.info("Redis Pub/Sub listener cancelled")
        except Exception as e:
            logger.error(f"Redis Pub/Sub listener error: {e}", exc_info=True)

    async def publish_notification(self, user_id: UUID, notification_data: dict):
        """Publish notification to Redis channel."""
        if not self.redis:
            logger.warning("Redis not connected, cannot publish notification")
            return
        
        try:
            message = {
                "user_id": str(user_id),
                **notification_data
            }
            await self.redis.publish("notifications", json.dumps(message))
            logger.debug(f"Published notification to Redis for user {user_id}")
        except Exception as e:
            logger.error(f"Error publishing to Redis: {e}")


# Global instance
redis_pubsub = RedisPubSubService()

