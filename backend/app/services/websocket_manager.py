"""
WebSocket connection manager for real-time notifications.
Manages active WebSocket connections and broadcasts messages.
"""

import asyncio
import json
import logging
from typing import Dict, Set
from uuid import UUID

from fastapi import WebSocket

logger = logging.getLogger(__name__)


class ConnectionManager:
    """Manages WebSocket connections for real-time notifications."""

    def __init__(self):
        # {user_id: {websocket1, websocket2, ...}}
        self.active_connections: Dict[UUID, Set[WebSocket]] = {}
        self._lock = asyncio.Lock()

    async def connect(self, websocket: WebSocket, user_id: UUID):
        """Accept WebSocket connection and add to active connections."""
        await websocket.accept()
        
        async with self._lock:
            if user_id not in self.active_connections:
                self.active_connections[user_id] = set()
            self.active_connections[user_id].add(websocket)
        
        logger.info(f"WebSocket connected: user_id={user_id}, total_connections={len(self.active_connections[user_id])}")

    async def disconnect(self, websocket: WebSocket, user_id: UUID):
        """Remove WebSocket connection from active connections."""
        async with self._lock:
            if user_id in self.active_connections:
                self.active_connections[user_id].discard(websocket)
                if not self.active_connections[user_id]:
                    del self.active_connections[user_id]
        
        logger.info(f"WebSocket disconnected: user_id={user_id}")

    async def send_personal_message(self, message: dict, user_id: UUID):
        """Send message to all WebSocket connections of a specific user."""
        if user_id not in self.active_connections:
            logger.debug(f"No active connections for user {user_id}")
            return
        
        disconnected = []
        connections = list(self.active_connections[user_id])
        
        for websocket in connections:
            try:
                await websocket.send_json(message)
                logger.debug(f"Message sent to user {user_id}: {message.get('type')}")
            except Exception as e:
                logger.error(f"Error sending message to user {user_id}: {e}")
                disconnected.append(websocket)
        
        # Clean up disconnected sockets
        if disconnected:
            async with self._lock:
                for ws in disconnected:
                    self.active_connections[user_id].discard(ws)
                if not self.active_connections[user_id]:
                    del self.active_connections[user_id]

    async def broadcast(self, message: dict):
        """Broadcast message to all connected users."""
        async with self._lock:
            user_ids = list(self.active_connections.keys())
        
        for user_id in user_ids:
            await self.send_personal_message(message, user_id)

    def get_active_users(self) -> Set[UUID]:
        """Get set of user IDs with active WebSocket connections."""
        return set(self.active_connections.keys())

    def get_connection_count(self, user_id: UUID) -> int:
        """Get number of active connections for a user."""
        return len(self.active_connections.get(user_id, set()))


# Global instance
manager = ConnectionManager()

