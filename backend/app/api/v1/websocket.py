"""WebSocket endpoint for real-time notifications."""

import logging
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Depends, Query, status
from jose import JWTError, jwt

from app.core.config import settings
from app.services.websocket_manager import manager

logger = logging.getLogger(__name__)

router = APIRouter()


async def get_current_user_ws(token: str = Query(...)) -> UUID:
    """
    Verify JWT token for WebSocket connection.
    Token is passed as query parameter since WebSocket doesn't support headers.
    """
    try:
        payload = jwt.decode(
            token, settings.SECRET_KEY, algorithms=[settings.JWT_ALGORITHM]
        )
        user_id: str = payload.get("sub")
        if user_id is None:
            raise ValueError("Invalid token: no user_id")
        return UUID(user_id)
    except (JWTError, ValueError) as e:
        logger.error(f"WebSocket auth error: {e}")
        raise


@router.websocket("/notifications")
async def websocket_notifications(
    websocket: WebSocket,
    user_id: Annotated[UUID, Depends(get_current_user_ws)],
):
    """
    WebSocket endpoint for real-time notifications.
    
    Client connects with: wss://calendar.corestone.ru/api/v1/ws/notifications?token=JWT_TOKEN
    
    Messages format:
    {
        "type": "notification",
        "data": {
            "id": "uuid",
            "title": "...",
            "message": "...",
            "type": "event_invited",
            "created_at": "2026-01-15T12:00:00",
            ...
        }
    }
    """
    await manager.connect(websocket, user_id)
    
    try:
        # Send connection confirmation
        await websocket.send_json({
            "type": "connected",
            "message": "WebSocket connected successfully",
            "user_id": str(user_id)
        })
        
        logger.info(f"WebSocket connection established for user {user_id}")
        
        # Keep connection alive and handle incoming messages
        while True:
            try:
                # Wait for messages from client (for keepalive/ping)
                data = await websocket.receive_text()
                
                # Handle ping/pong for keepalive
                if data == "ping":
                    await websocket.send_json({"type": "pong"})
                
            except WebSocketDisconnect:
                logger.info(f"WebSocket disconnected gracefully for user {user_id}")
                break
            except Exception as e:
                logger.error(f"Error in WebSocket receive loop for user {user_id}: {e}")
                break
    
    except Exception as e:
        logger.error(f"WebSocket error for user {user_id}: {e}", exc_info=True)
    
    finally:
        await manager.disconnect(websocket, user_id)
        logger.info(f"WebSocket connection closed for user {user_id}")

