"""Celery application configuration."""

from __future__ import annotations

import logging

from celery import Celery
from celery.schedules import crontab, timedelta

from app.core.config import settings

logger = logging.getLogger(__name__)

# Create Celery app
celery_app = Celery(
    "planner",
    broker=settings.CELERY_BROKER_URL,
    backend=settings.CELERY_RESULT_BACKEND,
    include=["app.tasks.notifications"],
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
    task_max_retries=5,  # Max 5 retries for critical tasks
    # Exponential backoff: delay = base_delay * (2 ** retry_count)
    task_retry_backoff=True,
    task_retry_backoff_max=600,  # Max 10 minutes between retries
    task_retry_jitter=True,  # Add randomness to prevent thundering herd
    # Result expiration
    result_expires=3600,  # Results expire after 1 hour
    # Worker settings - оптимизировано для 4-ядерного сервера
    worker_prefetch_multiplier=1,  # Prefetch only 1 task at a time for fairness
    worker_max_tasks_per_child=500,  # Restart worker after 500 tasks to prevent memory leaks
    worker_max_memory_per_child=200000,  # Restart worker if memory exceeds 200MB (in KB)
)

# Periodic tasks
celery_app.conf.beat_schedule = {
    # Send scheduled reminder notifications every minute
    "send-scheduled-reminders": {
        "task": "app.tasks.notifications.send_scheduled_reminders_task",
        "schedule": timedelta(seconds=60),  # Every 1 minute
    },
    # Example: Cleanup old notifications daily at 3 AM
    # "cleanup-old-notifications": {
    #     "task": "app.tasks.notifications.cleanup_old_notifications",
    #     "schedule": crontab(hour=3, minute=0),
    # },
}

logger.info(f"Celery app configured with broker: {settings.CELERY_BROKER_URL}")

