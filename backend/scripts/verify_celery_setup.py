#!/usr/bin/env python3
"""Скрипт для проверки работоспособности Redis + Celery."""

import sys
from pathlib import Path

# Добавляем путь к app
sys.path.insert(0, str(Path(__file__).parent.parent))

def check_redis():
    """Проверить подключение к Redis."""
    print("=" * 60)
    print("1. Проверка Redis")
    print("=" * 60)
    
    try:
        import redis
        from app.core.config import settings
        
        client = redis.Redis.from_url(settings.REDIS_URL, decode_responses=True)
        result = client.ping()
        
        if result:
            print("✅ Redis подключен успешно")
            print(f"   URL: {settings.REDIS_URL}")
            
            # Проверить информацию о сервере
            info = client.info("server")
            print(f"   Версия Redis: {info.get('redis_version', 'unknown')}")
            
            return True
        else:
            print("❌ Redis не отвечает на ping")
            return False
    except ImportError:
        print("❌ Модуль redis не установлен")
        return False
    except Exception as e:
        print(f"❌ Ошибка подключения к Redis: {e}")
        return False


def check_celery_app():
    """Проверить конфигурацию Celery."""
    print("\n" + "=" * 60)
    print("2. Проверка Celery App")
    print("=" * 60)
    
    try:
        from app.celery_app import celery_app
        from app.core.config import settings
        
        print("✅ Celery app загружен")
        print(f"   Broker: {settings.CELERY_BROKER_URL}")
        print(f"   Backend: {settings.CELERY_RESULT_BACKEND}")
        
        # Проверить зарегистрированные задачи
        registered = celery_app.tasks.keys()
        notification_tasks = [
            task for task in registered 
            if 'notification' in task.lower() or 'notify' in task.lower()
        ]
        
        print(f"\n   Зарегистрированные задачи уведомлений:")
        for task in notification_tasks:
            print(f"   - {task}")
        
        if notification_tasks:
            print(f"\n✅ Найдено {len(notification_tasks)} задач уведомлений")
        else:
            print("\n⚠️  Задачи уведомлений не найдены")
        
        return True
    except Exception as e:
        print(f"❌ Ошибка загрузки Celery app: {e}")
        import traceback
        traceback.print_exc()
        return False


def check_celery_connection():
    """Проверить подключение Celery к брокеру."""
    print("\n" + "=" * 60)
    print("3. Проверка подключения Celery к брокеру")
    print("=" * 60)
    
    try:
        from app.celery_app import celery_app
        
        # Проверить подключение к брокеру
        inspect = celery_app.control.inspect()
        active_workers = inspect.active()
        
        if active_workers:
            print("✅ Celery workers активны:")
            for worker_name, tasks in active_workers.items():
                print(f"   - {worker_name}: {len(tasks)} активных задач")
            return True
        else:
            print("⚠️  Celery workers не найдены (возможно, worker не запущен)")
            print("   Проверьте: sudo systemctl status planner-celery-worker")
            return False
    except Exception as e:
        print(f"❌ Ошибка проверки Celery workers: {e}")
        return False


def check_tasks_import():
    """Проверить импорт задач."""
    print("\n" + "=" * 60)
    print("4. Проверка импорта задач")
    print("=" * 60)
    
    try:
        from app.tasks.notifications import (
            notify_event_invited_task,
            notify_event_updated_task,
            notify_event_cancelled_task,
            notify_participant_response_task,
        )
        
        print("✅ Все задачи уведомлений импортированы:")
        print("   - notify_event_invited_task")
        print("   - notify_event_updated_task")
        print("   - notify_event_cancelled_task")
        print("   - notify_participant_response_task")
        
        return True
    except Exception as e:
        print(f"❌ Ошибка импорта задач: {e}")
        import traceback
        traceback.print_exc()
        return False


def check_cache():
    """Проверить Redis кеш."""
    print("\n" + "=" * 60)
    print("5. Проверка Redis кеша")
    print("=" * 60)
    
    try:
        from app.core.cache import get_cache
        
        cache = get_cache()
        
        # Тест записи и чтения
        test_key = "test:celery:setup"
        test_value = "test_value_123"
        
        cache.set(test_key, test_value, ttl=10)
        retrieved = cache.get(test_key)
        
        if retrieved == test_value:
            print("✅ Redis кеш работает корректно")
            cache.delete(test_key)
            return True
        else:
            print(f"❌ Ошибка кеша: ожидалось '{test_value}', получено '{retrieved}'")
            return False
    except Exception as e:
        print(f"❌ Ошибка проверки кеша: {e}")
        import traceback
        traceback.print_exc()
        return False


def check_rate_limiter():
    """Проверить rate limiter."""
    print("\n" + "=" * 60)
    print("6. Проверка Rate Limiter")
    print("=" * 60)
    
    try:
        from app.core.limiter import get_limiter
        
        limiter = get_limiter()
        print("✅ Rate limiter загружен")
        print(f"   Storage: {limiter.storage}")
        
        return True
    except Exception as e:
        print(f"❌ Ошибка проверки rate limiter: {e}")
        import traceback
        traceback.print_exc()
        return False


def main():
    """Главная функция проверки."""
    print("\n" + "=" * 60)
    print("ПРОВЕРКА НАСТРОЙКИ REDIS + CELERY")
    print("=" * 60 + "\n")
    
    results = []
    
    results.append(("Redis", check_redis()))
    results.append(("Celery App", check_celery_app()))
    results.append(("Celery Connection", check_celery_connection()))
    results.append(("Tasks Import", check_tasks_import()))
    results.append(("Cache", check_cache()))
    results.append(("Rate Limiter", check_rate_limiter()))
    
    # Итоги
    print("\n" + "=" * 60)
    print("ИТОГИ ПРОВЕРКИ")
    print("=" * 60)
    
    passed = sum(1 for _, result in results if result)
    total = len(results)
    
    for name, result in results:
        status = "✅ PASS" if result else "❌ FAIL"
        print(f"{status}: {name}")
    
    print(f"\nРезультат: {passed}/{total} проверок пройдено")
    
    if passed == total:
        print("\n🎉 Все проверки пройдены! Система настроена корректно.")
        return 0
    else:
        print(f"\n⚠️  {total - passed} проверок не пройдено. Проверьте логи выше.")
        return 1


if __name__ == "__main__":
    sys.exit(main())



