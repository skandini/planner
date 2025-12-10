from fastapi import APIRouter

from app.api.v1 import auth, calendars, departments, event_attachments, events, health, notifications, organizations, rooms, users, user_avatars, user_avatars


api_router = APIRouter()
api_router.include_router(health.router, prefix="/health", tags=["health"])
api_router.include_router(auth.router, prefix="/auth", tags=["auth"])
api_router.include_router(calendars.router, prefix="/calendars", tags=["calendars"])
api_router.include_router(events.router, prefix="/events", tags=["events"])
api_router.include_router(event_attachments.router, prefix="/events", tags=["event-attachments"])
api_router.include_router(notifications.router, prefix="/notifications", tags=["notifications"])
api_router.include_router(rooms.router, prefix="/rooms", tags=["rooms"])
api_router.include_router(users.router, prefix="/users", tags=["users"])
api_router.include_router(user_avatars.router, prefix="/users", tags=["users"])
api_router.include_router(organizations.router, prefix="/organizations", tags=["organizations"])
api_router.include_router(departments.router, prefix="/departments", tags=["departments"])
