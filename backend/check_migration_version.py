#!/usr/bin/env python3
"""
Скрипт для проверки и исправления версии миграций Alembic в базе данных.
Использует настройки из .env файла.
"""
import sys
from pathlib import Path

# Добавляем текущую директорию в path
BASE_DIR = Path(__file__).resolve().parent
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

from app.core.config import settings
from sqlalchemy import create_engine, text
from urllib.parse import urlparse


def get_db_params():
    """Получить параметры подключения к БД из DATABASE_URL."""
    url = settings.DATABASE_URL
    parsed = urlparse(url)
    
    return {
        'user': parsed.username or 'postgres',
        'password': parsed.password or '',
        'host': parsed.hostname or 'localhost',
        'port': parsed.port or 5432,
        'database': parsed.path.lstrip('/') if parsed.path else 'planner',
        'full_url': url
    }


def check_current_version():
    """Проверить текущую версию миграции в БД."""
    params = get_db_params()
    
    print(f"Подключение к БД: {params['host']}:{params['port']}/{params['database']}")
    print(f"Пользователь: {params['user']}")
    
    try:
        # Создаем подключение
        engine = create_engine(params['full_url'])
        
        with engine.connect() as conn:
            # Проверяем, существует ли таблица alembic_version
            result = conn.execute(text("""
                SELECT EXISTS (
                    SELECT FROM information_schema.tables 
                    WHERE table_schema = 'public' 
                    AND table_name = 'alembic_version'
                );
            """))
            table_exists = result.scalar()
            
            if not table_exists:
                print("Таблица alembic_version не существует!")
                return None
            
            # Получаем текущую версию
            result = conn.execute(text("SELECT version_num FROM alembic_version LIMIT 1;"))
            version = result.scalar()
            
            print(f"\nТекущая версия миграции в БД: {version}")
            return version
            
    except Exception as e:
        print(f"Ошибка при подключении к БД: {e}")
        return None


def cleanup_duplicates():
    """Удалить дубликаты и несуществующие миграции из alembic_version."""
    params = get_db_params()
    
    print(f"\nОчистка дубликатов в alembic_version...")
    
    try:
        engine = create_engine(params['full_url'])
        
        with engine.begin() as conn:
            # Сначала получаем все записи
            result = conn.execute(text("SELECT version_num FROM alembic_version;"))
            all_versions = [row[0] for row in result.fetchall()]
            
            print(f"Найдено записей в alembic_version: {len(all_versions)}")
            for version in all_versions:
                print(f"  - {version}")
            
            # Удаляем несуществующие миграции (например, 'add_composite_indexes')
            invalid_versions = ['add_composite_indexes']
            for invalid_version in invalid_versions:
                result = conn.execute(text(f"DELETE FROM alembic_version WHERE version_num = '{invalid_version}';"))
                if result.rowcount > 0:
                    print(f"✓ Удалена несуществующая миграция: {invalid_version}")
            
            # Если осталось больше одной записи, оставляем только последнюю реальную
            result = conn.execute(text("SELECT version_num FROM alembic_version ORDER BY version_num;"))
            remaining = [row[0] for row in result.fetchall()]
            
            if len(remaining) > 1:
                print(f"\nНайдено {len(remaining)} записей, удаляем все кроме последней...")
                # Оставляем только последнюю (обычно это 22a45ee15fd2 или более новая)
                keep_version = remaining[-1]  # Последняя в списке
                for version in remaining[:-1]:
                    conn.execute(text(f"DELETE FROM alembic_version WHERE version_num = '{version}';"))
                    print(f"✓ Удалена запись: {version}")
                print(f"✓ Оставлена запись: {keep_version}")
            
            return True
            
    except Exception as e:
        print(f"Ошибка при очистке дубликатов: {e}")
        return False


def update_version(new_version: str = None):
    """Обновить версию миграции в БД."""
    params = get_db_params()
    
    # Сначала очищаем дубликаты
    if not cleanup_duplicates():
        return False
    
    if new_version is None:
        # Используем последнюю известную версию
        new_version = '20309e2890d1'  # Последняя миграция из файлов
    
    print(f"\nОбновление версии миграции до: {new_version}")
    
    try:
        engine = create_engine(params['full_url'])
        
        with engine.begin() as conn:
            # Сначала удаляем все записи
            conn.execute(text("DELETE FROM alembic_version;"))
            # Затем вставляем новую версию
            conn.execute(text(f"INSERT INTO alembic_version (version_num) VALUES ('{new_version}');"))
            print(f"✓ Версия успешно обновлена до {new_version}")
            return True
            
    except Exception as e:
        print(f"Ошибка при обновлении версии: {e}")
        return False


if __name__ == "__main__":
    print("=" * 60)
    print("Проверка версии миграций Alembic")
    print("=" * 60)
    
    # Показываем параметры подключения (без пароля)
    params = get_db_params()
    print(f"\nDATABASE_URL из .env: {params['full_url'].split('@')[-1] if '@' in params['full_url'] else params['full_url']}")
    
    # Если передан аргумент --update, обновляем версию
    if len(sys.argv) > 1 and sys.argv[1] == '--update':
        update_version()
    else:
        # Проверяем текущую версию
        current_version = check_current_version()
        
        if current_version:
            print(f"\nДля исправления миграций выполните:")
            print(f"  python check_migration_version.py --update")
            print(f"\nИли вручную через psql:")
            print(f"  psql -h {params['host']} -U {params['user']} -d {params['database']} -c \"UPDATE alembic_version SET version_num = '20309e2890d1';\"")

