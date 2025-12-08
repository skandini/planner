from fastapi import APIRouter

from app.api.v1 import auth, calendars, event_attachments, events, health, notifications, rooms, users


api_router = APIRouter()
api_router.include_router(health.router, prefix="/health", tags=["health"])
api_router.include_router(auth.router, prefix="/auth", tags=["auth"])
api_router.include_router(calendars.router, prefix="/calendars", tags=["calendars"])
api_router.include_router(events.router, prefix="/events", tags=["events"])
api_router.include_router(event_attachments.router, prefix="/events", tags=["event-attachments"])
api_router.include_router(notifications.router, prefix="/notifications", tags=["notifications"])
api_router.include_router(rooms.router, prefix="/rooms", tags=["rooms"])
api_router.include_router(users.router, prefix="/users", tags=["users"])
