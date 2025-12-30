"""
Утилиты для оптимизации асинхронной обработки
"""
from __future__ import annotations

import asyncio
from typing import List, TypeVar, Callable, Awaitable, Optional
from functools import wraps
import logging

logger = logging.getLogger(__name__)

T = TypeVar("T")


async def batch_process(
    items: List[T],
    processor: Callable[[T], Awaitable[None]],
    batch_size: int = 10,
    max_concurrent: int = 5,
) -> None:
    """
    Обрабатывает элементы батчами с ограничением параллелизма.
    
    Args:
        items: Список элементов для обработки
        processor: Асинхронная функция обработки одного элемента
        batch_size: Размер батча
        max_concurrent: Максимальное количество параллельных операций
    """
    semaphore = asyncio.Semaphore(max_concurrent)
    
    async def process_with_semaphore(item: T) -> None:
        async with semaphore:
            try:
                await processor(item)
            except Exception as e:
                logger.error(f"Error processing item {item}: {e}", exc_info=True)
    
    for i in range(0, len(items), batch_size):
        batch = items[i : i + batch_size]
        await asyncio.gather(*[process_with_semaphore(item) for item in batch])


def retry_async(
    max_attempts: int = 3,
    delay: float = 1.0,
    backoff: float = 2.0,
    exceptions: tuple = (Exception,),
):
    """
    Декоратор для повторных попыток асинхронных функций.
    
    Args:
        max_attempts: Максимальное количество попыток
        delay: Начальная задержка между попытками
        backoff: Множитель для увеличения задержки
        exceptions: Кортеж исключений, при которых нужно повторять попытку
    """
    def decorator(func: Callable[..., Awaitable[T]]) -> Callable[..., Awaitable[T]]:
        @wraps(func)
        async def wrapper(*args, **kwargs) -> T:
            current_delay = delay
            last_exception = None
            
            for attempt in range(max_attempts):
                try:
                    return await func(*args, **kwargs)
                except exceptions as e:
                    last_exception = e
                    if attempt < max_attempts - 1:
                        logger.warning(
                            f"Attempt {attempt + 1} failed for {func.__name__}: {e}. "
                            f"Retrying in {current_delay}s..."
                        )
                        await asyncio.sleep(current_delay)
                        current_delay *= backoff
                    else:
                        logger.error(
                            f"All {max_attempts} attempts failed for {func.__name__}"
                        )
            
            raise last_exception
        
        return wrapper
    return decorator


async def gather_with_errors(
    *coros: Awaitable[T],
    return_exceptions: bool = True,
) -> List[T | Exception]:
    """
    Выполняет корутины параллельно и возвращает результаты даже при ошибках.
    
    Args:
        *coros: Корутины для выполнения
        return_exceptions: Если True, исключения возвращаются как результаты
    
    Returns:
        Список результатов или исключений
    """
    results = await asyncio.gather(*coros, return_exceptions=return_exceptions)
    return list(results)


def run_in_background(coro: Awaitable[None]) -> None:
    """
    Запускает корутину в фоне без ожидания результата.
    Полезно для фоновых задач, которые не должны блокировать основной поток.
    """
    def handle_task(task: asyncio.Task) -> None:
        try:
            task.result()
        except Exception as e:
            logger.error(f"Background task failed: {e}", exc_info=True)
    
    task = asyncio.create_task(coro)
    task.add_done_callback(handle_task)

