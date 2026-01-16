"""Celery application configuration."""

from __future__ import annotations

import logging

from celery import Celery
from celery.schedules import crontab

from app.core.config import settings

logger = logging.getLogger(__name__)

# Create Celery app
celery_app = Celery(
    "planner",
    broker=settings.CELERY_BROKER_URL,
    backend=settings.CELERY_RESULT_BACKEND,
    include=["app.tasks.notifications", "app.tasks.reminders"],
)

# Celery configuration
celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    # Broker connection
    broker_connection_retry_on_startup=True,  # Retry connection on startup
    # Task execution settings
    task_acks_late=True,  # Acknowledge tasks after execution
    task_reject_on_worker_lost=True,  # Re-queue tasks if worker dies
    # Retry settings
    task_default_retry_delay=60,  # Retry after 60 seconds
    task_max_retries=3,  # Max 3 retries
    # Result expiration
    result_expires=3600,  # Results expire after 1 hour
    # Worker settings
    worker_prefetch_multiplier=1,  # Prefetch only 1 task at a time for fairness
    worker_max_tasks_per_child=1000,  # Restart worker after 1000 tasks
)

# Periodic tasks
celery_app.conf.beat_schedule = {
    # Отправка напоминаний о событиях (каждую минуту)
    "send-event-reminders": {
        "task": "app.tasks.reminders.send_event_reminders",
        "schedule": 60.0,  # Каждые 60 секунд (1 минута)
    },
    # Example: Cleanup old notifications daily at 3 AM
    # "cleanup-old-notifications": {
    #     "task": "app.tasks.notifications.cleanup_old_notifications",
    #     "schedule": crontab(hour=3, minute=0),
    # },
}

logger.info(f"Celery app configured with broker: {settings.CELERY_BROKER_URL}")

