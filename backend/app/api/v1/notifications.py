from __future__ import annotations

from datetime import datetime
from typing import List
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlmodel import select

from app.api.deps import get_current_user
from app.db import SessionDep
from app.models import Notification, User
from app.schemas import NotificationRead, NotificationUpdate

router = APIRouter()


@router.get("/", response_model=List[NotificationRead], summary="List notifications")
def list_notifications(
    session: SessionDep,
    current_user: User = Depends(get_current_user),
    unread_only: bool = Query(default=False, description="Show only unread notifications"),
    limit: int = Query(default=50, ge=1, le=100, description="Maximum number of notifications"),
) -> List[NotificationRead]:
    """Get user's notifications."""
    try:
        statement = select(Notification).where(
            Notification.user_id == current_user.id,
            Notification.is_deleted == False,  # Исключаем удаленные
        )
        
        if unread_only:
            statement = statement.where(Notification.is_read == False)
        
        statement = statement.order_by(Notification.created_at.desc()).limit(limit)
        notifications = session.exec(statement).all()
        
        # Убеждаемся, что все поля присутствуют
        result = []
        for notification in notifications:
            if not hasattr(notification, 'is_deleted'):
                notification.is_deleted = False
            if not hasattr(notification, 'deleted_at'):
                notification.deleted_at = None
            result.append(notification)
        
        return result
    except Exception as e:
        import traceback
        error_msg = f"Error listing notifications: {str(e)}"
        print(f"[ERROR] {error_msg}")
        print(traceback.format_exc())
        raise HTTPException(
            status_code=500,
            detail=error_msg
        )


@router.get("/unread-count", summary="Get unread notifications count")
def get_unread_count(
    session: SessionDep,
    current_user: User = Depends(get_current_user),
) -> dict:
    """Get count of unread notifications."""
    statement = select(Notification).where(
        Notification.user_id == current_user.id,
        Notification.is_read == False,
        Notification.is_deleted == False,  # Исключаем удаленные
    )
    count = len(session.exec(statement).all())
    return {"count": count}


@router.patch("/mark-all-read", summary="Mark all notifications as read")
def mark_all_read(
    session: SessionDep,
    current_user: User = Depends(get_current_user),
) -> dict:
    """Mark all user's notifications as read."""
    try:
        statement = select(Notification).where(
            Notification.user_id == current_user.id,
            Notification.is_read == False,
            Notification.is_deleted == False,  # Исключаем удаленные
        )
        notifications = session.exec(statement).all()
        
        now = datetime.utcnow()
        for notification in notifications:
            notification.is_read = True
            notification.read_at = now
            session.add(notification)
        
        session.commit()
        return {"marked": len(notifications)}
    except Exception as e:
        import traceback
        error_msg = f"Error marking all notifications as read: {str(e)}"
        print(f"[ERROR] {error_msg}")
        print(traceback.format_exc())
        raise HTTPException(
            status_code=500,
            detail=error_msg
        )


@router.patch(
    "/{notification_id}",
    response_model=NotificationRead,
    summary="Update notification",
)
def update_notification(
    notification_id: str,
    data: NotificationUpdate,
    session: SessionDep,
    current_user: User = Depends(get_current_user),
) -> NotificationRead:
    """Update notification (mark as read/unread or soft delete)."""
    try:
        # Конвертируем строку в UUID
        try:
            notification_uuid = UUID(notification_id)
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid notification ID format")
        
        notification = session.get(Notification, notification_uuid)
        if not notification:
            raise HTTPException(status_code=404, detail="Notification not found")
        
        if notification.user_id != current_user.id:
            raise HTTPException(status_code=403, detail="Not your notification")
        
        # Обновляем is_read если передан
        if data.is_read is not None:
            notification.is_read = data.is_read
            if data.is_read and not notification.read_at:
                notification.read_at = datetime.utcnow()
            elif not data.is_read:
                notification.read_at = None
        
        # Мягкое удаление
        if data.is_deleted is not None:
            notification.is_deleted = data.is_deleted
            if data.is_deleted and not notification.deleted_at:
                notification.deleted_at = datetime.utcnow()
            elif not data.is_deleted:
                notification.deleted_at = None
        
        session.add(notification)
        session.commit()
        session.refresh(notification)
        
        # Убеждаемся, что все поля присутствуют
        if not hasattr(notification, 'is_deleted'):
            notification.is_deleted = False
        if not hasattr(notification, 'deleted_at'):
            notification.deleted_at = None
            
        return notification
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        error_msg = f"Error updating notification {notification_id}: {str(e)}"
        print(f"[ERROR] {error_msg}")
        print(traceback.format_exc())
        raise HTTPException(
            status_code=500,
            detail=error_msg
        )


# DELETE endpoint удален - используем мягкое удаление через PATCH с is_deleted=true
# Это позволяет избежать проблем с CORS для DELETE запросов


