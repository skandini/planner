from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import List
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import select

from app.api.deps import SessionDep, get_current_user, is_admin_or_it
from app.models import (
    AdminNotification,
    AdminNotificationDismissal,
    Department,
    User,
    UserDepartment,
)
from app.schemas.admin_notification import (
    AdminNotificationCreate,
    AdminNotificationDismiss,
    AdminNotificationRead,
)

router = APIRouter()


@router.get("/test", summary="Test endpoint")
def test_endpoint():
    """Test endpoint to verify router is working."""
    return {"status": "ok", "message": "Admin notifications router is working"}


@router.post(
    "/",
    response_model=AdminNotificationRead,
    status_code=status.HTTP_201_CREATED,
    summary="Create admin notification",
)
def create_admin_notification(
    payload: AdminNotificationCreate,
    session: SessionDep,
    current_user: User = Depends(get_current_user),
) -> AdminNotificationRead:
    """Create a new admin notification."""
    print(f"\n[DEBUG] ===== Creating notification =====")
    print(f"[DEBUG] User: {current_user.id} ({current_user.email})")
    print(f"[DEBUG] Payload type: {type(payload)}")
    print(f"[DEBUG] Payload: {payload.model_dump()}")
    
    # Проверяем права доступа
    try:
        is_admin = is_admin_or_it(current_user, session)
        print(f"[DEBUG] User is_admin_or_it: {is_admin}")
        if not is_admin:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only admins can create notifications",
            )
    except HTTPException:
        raise
    except Exception as e:
        print(f"[ERROR] Error checking admin rights: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error checking permissions: {str(e)}",
        )

    # Вычисляем время окончания
    expires_at = None
    if payload.display_duration_hours > 0:
        expires_at = datetime.now(timezone.utc) + timedelta(hours=payload.display_duration_hours)

    # Создаем уведомление
    try:
        print(f"[DEBUG] Preparing notification data...")
        print(f"[DEBUG] target_user_ids type: {type(payload.target_user_ids)}, value: {payload.target_user_ids}")
        print(f"[DEBUG] target_department_ids type: {type(payload.target_department_ids)}, value: {payload.target_department_ids}")
        
        # Конвертируем UUID в строки для хранения в JSON
        target_user_ids = [str(uid) if isinstance(uid, UUID) else str(uid) for uid in (payload.target_user_ids or [])]
        target_department_ids = [str(did) if isinstance(did, UUID) else str(did) for did in (payload.target_department_ids or [])]
        
        print(f"[DEBUG] Converted target_user_ids: {target_user_ids}")
        print(f"[DEBUG] Converted target_department_ids: {target_department_ids}")
        print(f"[DEBUG] expires_at: {expires_at}, type: {type(expires_at)}")
        
        notification = AdminNotification(
            title=payload.title,
            message=payload.message,
            created_by=current_user.id,
            target_user_ids=target_user_ids,
            target_department_ids=target_department_ids,
            display_duration_hours=payload.display_duration_hours,
            expires_at=expires_at,
            is_active=True,
        )
        print(f"[DEBUG] Notification object created successfully")
        session.add(notification)
        print(f"[DEBUG] Notification added to session")
        session.commit()
        print(f"[DEBUG] Session committed successfully")
        session.refresh(notification)
        print(f"[DEBUG] Notification refreshed: id={notification.id}")
    except Exception as e:
        print(f"[ERROR] Error creating notification: {type(e).__name__}: {e}")
        import traceback
        traceback.print_exc()
        session.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error creating notification: {str(e)}",
        )

    # Конвертируем строки обратно в UUID для ответа
    target_user_ids_uuid = [UUID(uid) for uid in (notification.target_user_ids or [])]
    target_department_ids_uuid = [UUID(did) for did in (notification.target_department_ids or [])]
    
    return AdminNotificationRead(
        id=notification.id,
        title=notification.title,
        message=notification.message,
        created_by=notification.created_by,
        created_at=notification.created_at,
        target_user_ids=target_user_ids_uuid,
        target_department_ids=target_department_ids_uuid,
        display_duration_hours=notification.display_duration_hours,
        expires_at=notification.expires_at,
        is_active=notification.is_active,
        is_dismissed=False,
    )


@router.get(
    "/",
    response_model=List[AdminNotificationRead],
    summary="Get active notifications for current user",
)
def get_user_notifications(
    session: SessionDep,
    current_user: User = Depends(get_current_user),
) -> List[AdminNotificationRead]:
    """Get active notifications for the current user."""
    try:
        print(f"[DEBUG] ===== START get_user_notifications =====")
        print(f"[DEBUG] Getting notifications for user {current_user.id} ({current_user.email})")
        now = datetime.now(timezone.utc)
        print(f"[DEBUG] Current time: {now}")

        # Получаем все активные уведомления
        try:
            statement = select(AdminNotification).where(
                AdminNotification.is_active == True
            )
            notifications = session.exec(statement).all()
            if notifications is None:
                notifications = []
            print(f"[DEBUG] Found {len(notifications)} active notifications")
        except Exception as e:
            print(f"[ERROR] Error loading notifications: {type(e).__name__}: {e}")
            import traceback
            traceback.print_exc()
            notifications = []

        # Если уведомлений нет, возвращаем пустой список
        if not notifications or len(notifications) == 0:
            print(f"[DEBUG] No notifications found, returning empty list")
            return []

        # Фильтруем по времени и получателям
        user_notifications = []
        try:
            dismissed_results = session.exec(
                select(AdminNotificationDismissal.notification_id).where(
                    AdminNotificationDismissal.user_id == current_user.id
                )
            ).all()
            # Убеждаемся, что все ID - это UUID объекты
            dismissed_ids = set()
            if dismissed_results:
                for nid in dismissed_results:
                    if isinstance(nid, UUID):
                        dismissed_ids.add(nid)
                    else:
                        try:
                            dismissed_ids.add(UUID(str(nid)))
                        except (ValueError, TypeError):
                            continue
        except Exception as e:
            print(f"[WARNING] Error loading dismissed notifications: {e}")
            dismissed_ids = set()
        print(f"[DEBUG] User has dismissed {len(dismissed_ids)} notifications")

        for notification in notifications:
            try:
                print(f"[DEBUG] Processing notification {notification.id}")
                
                # Проверяем срок действия
                if notification.expires_at:
                    try:
                        if notification.expires_at < now:
                            print(f"[DEBUG] Notification {notification.id} expired")
                            continue
                    except Exception as e:
                        print(f"[WARNING] Error checking expiration for notification {notification.id}: {e}")
                        # Продолжаем обработку даже если есть проблема с expires_at

                # Проверяем, скрыто ли пользователем
                if notification.id in dismissed_ids:
                    print(f"[DEBUG] Notification {notification.id} dismissed by user")
                    continue

                # Проверяем, является ли пользователь получателем
                is_recipient = False

                # Если оба списка пустые, уведомление для всех
                target_user_ids = notification.target_user_ids or []
                target_department_ids = notification.target_department_ids or []
                
                print(f"[DEBUG] Notification {notification.id}: target_user_ids={len(target_user_ids)}, target_department_ids={len(target_department_ids)}")
                
                if not target_user_ids and not target_department_ids:
                    is_recipient = True
                    print(f"[DEBUG] Notification {notification.id} is for everyone")
                else:
                    # Проверяем прямых получателей (конвертируем строки в UUID для сравнения)
                    if target_user_ids:
                        try:
                            target_user_ids_uuid = set()
                            for uid in target_user_ids:
                                try:
                                    target_user_ids_uuid.add(UUID(str(uid)))
                                except (ValueError, TypeError):
                                    continue
                            if current_user.id in target_user_ids_uuid:
                                is_recipient = True
                        except Exception:
                            pass

                    # Проверяем получателей через отделы
                    if not is_recipient and target_department_ids:
                        try:
                            user_departments = session.exec(
                                select(UserDepartment).where(UserDepartment.user_id == current_user.id)
                            ).all()
                            user_dept_ids = {ud.department_id for ud in user_departments}
                            target_dept_ids_uuid = set()
                            for did in target_department_ids:
                                try:
                                    target_dept_ids_uuid.add(UUID(str(did)))
                                except (ValueError, TypeError):
                                    continue
                            if user_dept_ids.intersection(target_dept_ids_uuid):
                                is_recipient = True
                        except Exception:
                            pass

                if is_recipient:
                    # Конвертируем строки обратно в UUID для ответа
                    target_user_ids_uuid = []
                    for uid in (notification.target_user_ids or []):
                        try:
                            # Если уже UUID, используем как есть, иначе конвертируем из строки
                            if isinstance(uid, UUID):
                                target_user_ids_uuid.append(uid)
                            else:
                                target_user_ids_uuid.append(UUID(str(uid)))
                        except (ValueError, TypeError, AttributeError):
                            continue
                    
                    target_department_ids_uuid = []
                    for did in (notification.target_department_ids or []):
                        try:
                            # Если уже UUID, используем как есть, иначе конвертируем из строки
                            if isinstance(did, UUID):
                                target_department_ids_uuid.append(did)
                            else:
                                target_department_ids_uuid.append(UUID(str(did)))
                        except (ValueError, TypeError, AttributeError):
                            continue
                    
                    # Создаем объект уведомления для чтения
                    try:
                        # Убеждаемся, что datetime объекты имеют timezone
                        created_at = notification.created_at
                        if created_at and created_at.tzinfo is None:
                            created_at = created_at.replace(tzinfo=timezone.utc)
                        
                        expires_at = notification.expires_at
                        if expires_at and expires_at.tzinfo is None:
                            expires_at = expires_at.replace(tzinfo=timezone.utc)
                        
                        # Создаем объект уведомления для чтения
                        notification_read = AdminNotificationRead(
                            id=notification.id,
                            title=notification.title,
                            message=notification.message,
                            created_by=notification.created_by,
                            created_at=created_at,
                            target_user_ids=target_user_ids_uuid,
                            target_department_ids=target_department_ids_uuid,
                            display_duration_hours=notification.display_duration_hours,
                            expires_at=expires_at,
                            is_active=notification.is_active,
                            is_dismissed=notification.id in dismissed_ids,
                        )
                        user_notifications.append(notification_read)
                        print(f"[DEBUG] Successfully added notification {notification.id} to user notifications")
                    except Exception as e:
                        print(f"[ERROR] Error creating AdminNotificationRead for notification {notification.id}: {type(e).__name__}: {e}")
                        import traceback
                        traceback.print_exc()
                        continue
            except Exception as e:
                print(f"[ERROR] Error processing notification {notification.id}: {type(e).__name__}: {e}")
                import traceback
                traceback.print_exc()
                # Пропускаем это уведомление, но продолжаем обработку остальных
                continue

        print(f"[DEBUG] Returning {len(user_notifications)} notifications for user")
        
        # Убеждаемся, что возвращаем список
        if not isinstance(user_notifications, list):
            print(f"[WARNING] user_notifications is not a list, converting...")
            user_notifications = list(user_notifications) if user_notifications else []
        
        print(f"[DEBUG] Final return: {len(user_notifications)} notifications, type: {type(user_notifications)}")
        print(f"[DEBUG] ===== END get_user_notifications (SUCCESS) =====")
        return user_notifications
    except HTTPException as e:
        print(f"[DEBUG] Re-raising HTTPException: {e.status_code} - {e.detail}")
        print(f"[DEBUG] ===== END get_user_notifications (HTTPException) =====")
        raise
    except Exception as e:
        print(f"[ERROR] ===== ERROR in get_user_notifications =====")
        print(f"[ERROR] Error type: {type(e).__name__}")
        print(f"[ERROR] Error message: {e}")
        print(f"[ERROR] Error args: {e.args}")
        import traceback
        print(f"[ERROR] Traceback:")
        traceback.print_exc()
        print(f"[ERROR] ===== END ERROR =====")
        # В случае ошибки возвращаем пустой список вместо 500 ошибки
        # Это позволит фронтенду работать даже если есть проблемы с данными
        print(f"[WARNING] Returning empty list due to error")
        print(f"[DEBUG] ===== END get_user_notifications (ERROR -> empty list) =====")
        return []


@router.post(
    "/{notification_id}/dismiss",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Dismiss notification",
)
def dismiss_notification(
    notification_id: UUID,
    session: SessionDep,
    current_user: User = Depends(get_current_user),
):
    """Dismiss a notification for the current user."""
    print(f"[DEBUG] Dismissing notification {notification_id} for user {current_user.id}")
    
    # Проверяем, существует ли уведомление
    notification = session.get(AdminNotification, notification_id)
    if not notification:
        print(f"[WARNING] Notification {notification_id} not found")
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Notification not found",
        )

    # Проверяем, не скрыто ли уже
    existing = session.exec(
        select(AdminNotificationDismissal).where(
            AdminNotificationDismissal.notification_id == notification_id,
            AdminNotificationDismissal.user_id == current_user.id,
        )
    ).one_or_none()

    if not existing:
        print(f"[DEBUG] Creating dismissal record for notification {notification_id}")
        dismissal = AdminNotificationDismissal(
            notification_id=notification_id,
            user_id=current_user.id,
        )
        session.add(dismissal)
        session.commit()
        print(f"[DEBUG] Notification {notification_id} dismissed successfully")
    else:
        print(f"[DEBUG] Notification {notification_id} already dismissed")

    return None

