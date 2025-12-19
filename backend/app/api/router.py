from fastapi import APIRouter

from app.api.v1 import admin_notifications, auth, availability_slots, calendars, departments, event_attachments, event_comments, events, health, notifications, organizations, room_access, rooms, statistics, ticket_attachments, ticket_comments, tickets, user_availability, users, user_avatars


api_router = APIRouter()
api_router.include_router(health.router, prefix="/health", tags=["health"])
api_router.include_router(auth.router, prefix="/auth", tags=["auth"])
api_router.include_router(availability_slots.router, prefix="/availability-slots", tags=["availability-slots"])
api_router.include_router(calendars.router, prefix="/calendars", tags=["calendars"])
api_router.include_router(events.router, prefix="/events", tags=["events"])
api_router.include_router(event_attachments.router, prefix="/events", tags=["event-attachments"])
api_router.include_router(event_comments.router, prefix="", tags=["event-comments"])
api_router.include_router(notifications.router, prefix="/notifications", tags=["notifications"])
api_router.include_router(admin_notifications.router, prefix="/admin-notifications", tags=["admin-notifications"])
api_router.include_router(rooms.router, prefix="/rooms", tags=["rooms"])
api_router.include_router(room_access.router, prefix="", tags=["room-access"])
api_router.include_router(statistics.router, prefix="/statistics", tags=["statistics"])
api_router.include_router(users.router, prefix="/users", tags=["users"])
api_router.include_router(user_avatars.router, prefix="/users", tags=["users"])
api_router.include_router(user_availability.router, prefix="/users", tags=["users"])
api_router.include_router(organizations.router, prefix="/organizations", tags=["organizations"])
api_router.include_router(departments.router, prefix="/departments", tags=["departments"])
api_router.include_router(tickets.router, prefix="/tickets", tags=["tickets"])
api_router.include_router(ticket_comments.router, prefix="", tags=["ticket-comments"])
api_router.include_router(ticket_attachments.router, prefix="", tags=["ticket-attachments"])
api_router.include_router(ticket_attachments.router, prefix="", tags=["ticket-attachments"])
