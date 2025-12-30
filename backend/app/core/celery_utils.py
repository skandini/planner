"""Утилиты для безопасной работы с Celery."""

from __future__ import annotations

import logging
from typing import Any, Optional

from app.celery_app import celery_app

logger = logging.getLogger(__name__)


def safe_celery_delay(task, *args, **kwargs) -> Optional[Any]:
    """
    Безопасно вызывает Celery задачу.
    
    Если Celery недоступен (например, Redis не запущен в локальной разработке),
    функция просто логирует предупреждение и возвращает None вместо падения с ошибкой.
    
    Args:
        task: Celery задача для выполнения
        *args: Позиционные аргументы для задачи
        **kwargs: Именованные аргументы для задачи
    
    Returns:
        Результат вызова task.delay() или None, если Celery недоступен
    """
    try:
        # Пытаемся вызвать задачу
        # Если Celery broker недоступен, это вызовет исключение
        result = task.delay(*args, **kwargs)
        logger.debug(f"Celery task {task.name} queued with ID: {result.id}")
        return result
    
    except Exception as e:
        # Если Celery недоступен (Redis не запущен и т.д.), просто логируем
        # и продолжаем работу без фоновых задач
        # Это нормально в локальной разработке без Redis
        logger.debug(
            f"Failed to queue Celery task {task.name}: {e}. "
            f"Continuing without background task execution. "
            f"This is normal in local development without Redis."
        )
        return None

