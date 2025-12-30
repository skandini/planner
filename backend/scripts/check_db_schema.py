#!/usr/bin/env python3
"""Проверка структуры базы данных и соответствия моделям."""

import sqlite3
from pathlib import Path
import sys
import io

# Настройка кодировки для Windows
if sys.platform == "win32":
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

# Добавляем путь к проекту
BASE_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BASE_DIR))

from app.models import User
from sqlmodel import SQLModel


def check_table_structure(table_name: str, model_class, cursor):
    """Проверяет структуру таблицы."""
    # Получаем колонки из базы данных
    cursor.execute(f"PRAGMA table_info({table_name})")
    db_columns = {col[1]: col[2] for col in cursor.fetchall()}
    
    # Получаем колонки из модели
    model_columns = {}
    for field_name, field_info in model_class.model_fields.items():
        if field_name != "id":  # id всегда есть
            model_columns[field_name] = str(field_info.annotation)
    
    # Проверяем отсутствующие колонки
    missing_columns = []
    for col_name in model_columns:
        if col_name not in db_columns:
            missing_columns.append(col_name)
    
    # Проверяем лишние колонки
    extra_columns = []
    for col_name in db_columns:
        if col_name not in model_columns and col_name != "id":
            extra_columns.append(col_name)
    
    return missing_columns, extra_columns, len(db_columns), len(model_columns)


def check_all_tables():
    """Проверяет структуру всех таблиц."""
    db_path = BASE_DIR / "calendar.db"
    
    if not db_path.exists():
        print("❌ База данных не найдена!")
        return False
    
    conn = sqlite3.connect(str(db_path))
    cursor = conn.cursor()
    
    # Импортируем все модели
    from app.models import (
        User, Room, Organization, Calendar, Event, Department,
        CalendarMember, EventParticipant, Notification, EventAttachment,
        EventComment, AdminNotification, AdminNotificationDismissal,
        AvailabilitySlot, UserAvailabilitySchedule, UserDepartment,
        UserOrganization, RoomAccess, Ticket, TicketAttachment, TicketComment
    )
    
    # Словарь таблиц для проверки
    tables_to_check = {
        "users": User,
        "rooms": Room,
        "organizations": Organization,
        "calendars": Calendar,
        "events": Event,
        "departments": Department,
    }
    
    all_ok = True
    print("\n📊 Проверка структуры таблиц:\n")
    
    for table_name, model_class in tables_to_check.items():
        try:
            missing, extra, db_count, model_count = check_table_structure(
                table_name, model_class, cursor
            )
            
            status = "✅" if not missing and not extra else "❌"
            print(f"{status} {table_name}:")
            print(f"   Колонок в БД: {db_count}, Поля в модели: {model_count}")
            
            if missing:
                all_ok = False
                for col in missing:
                    print(f"   ❌ Отсутствует: {col}")
            
            if extra:
                for col in extra:
                    print(f"   ⚠️  Лишняя колонка: {col}")
            
            if not missing and not extra:
                print(f"   ✅ Структура соответствует модели!")
            
        except Exception as e:
            print(f"⚠️  {table_name}: Ошибка проверки - {e}")
            all_ok = False
    
    conn.close()
    return all_ok


def check_migration_version():
    """Проверяет версию миграций."""
    db_path = BASE_DIR / "calendar.db"
    
    if not db_path.exists():
        print("❌ База данных не найдена!")
        return None
    
    conn = sqlite3.connect(str(db_path))
    cursor = conn.cursor()
    
    try:
        cursor.execute("SELECT version_num FROM alembic_version")
        version = cursor.fetchone()
        if version:
            print(f"\n📌 Текущая версия миграций: {version[0]}")
            return version[0]
        else:
            print("\n⚠️  Версия миграций не найдена!")
            return None
    except sqlite3.OperationalError:
        print("\n⚠️  Таблица alembic_version не найдена!")
        return None
    finally:
        conn.close()


def main():
    """Основная функция."""
    print("🔍 Проверка состояния базы данных...\n")
    
    version = check_migration_version()
    is_ok = check_all_tables()
    
    print("\n" + "="*50)
    if is_ok:
        print("✅ База данных в порядке!")
    else:
        print("❌ Обнаружены проблемы!")
        print("\n💡 Решение:")
        print("   1. Проверьте миграции: alembic current")
        print("   2. Примените миграции: alembic upgrade head")
        print("   3. Если проблема сохраняется, добавьте недостающие колонки вручную")
        print("   4. Подробнее см. LOCAL_DEVELOPMENT_GUIDE.md")
    
    return 0 if is_ok else 1


if __name__ == "__main__":
    sys.exit(main())

