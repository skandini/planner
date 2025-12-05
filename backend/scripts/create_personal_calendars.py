"""
Скрипт для создания личных календарей для всех существующих пользователей.
Запускать один раз после миграции на новую логику.
"""
import sys
from pathlib import Path

# Добавляем корневую директорию проекта в путь
project_root = Path(__file__).parent.parent
sys.path.insert(0, str(project_root))

from sqlmodel import Session, select

from app.db import engine
from app.models import Calendar, User
from app.services.personal_calendar import ensure_personal_calendar


def main():
    """Создает личные календари для всех пользователей, у которых их еще нет."""
    with Session(engine) as session:
        # Получаем всех пользователей
        users = session.exec(select(User)).all()
        
        if not users:
            print("Пользователей не найдено.")
            return
        
        created_count = 0
        for user in users:
            try:
                # Проверяем, есть ли уже личный календарь
                existing = session.exec(
                    select(Calendar).where(
                        Calendar.owner_id == user.id,
                        Calendar.name == "Личный календарь",
                    )
                ).first()
                
                if not existing:
                    ensure_personal_calendar(session, user.id)
                    created_count += 1
                    print(f"✅ Создан личный календарь для {user.email}")
                else:
                    print(f"⏭️  Личный календарь уже существует для {user.email}")
            except Exception as e:
                print(f"❌ Ошибка при создании календаря для {user.email}: {e}")
        
        print(f"\n📊 Итого: создано {created_count} личных календарей из {len(users)} пользователей")


if __name__ == "__main__":
    main()

