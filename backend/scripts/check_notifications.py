#!/usr/bin/env python3
"""Скрипт для проверки уведомлений в БД."""

import sys
from pathlib import Path

# Добавляем путь к app
sys.path.insert(0, str(Path(__file__).parent.parent))

from sqlmodel import Session, select
from app.db import engine
from app.models import Notification

def main():
    """Проверить уведомления в БД."""
    print("=" * 80)
    print("ПРОВЕРКА УВЕДОМЛЕНИЙ В БД")
    print("=" * 80)
    print()
    
    with Session(engine) as session:
        # Получить последние 10 уведомлений
        notifications = session.exec(
            select(Notification)
            .order_by(Notification.created_at.desc())
            .limit(10)
        ).all()
        
        print(f"Найдено уведомлений (последние 10): {len(notifications)}")
        print()
        
        if notifications:
            print(f"{'ID':<40} {'Type':<25} {'Title':<40} {'Created At'}")
            print("-" * 80)
            for n in notifications:
                print(f"{str(n.id):<40} {n.type:<25} {n.title[:37]:<40} {n.created_at}")
        else:
            print("Уведомления не найдены")
        
        print()
        print("=" * 80)
        
        # Статистика по типам
        from sqlmodel import func
        stats = session.exec(
            select(
                Notification.type,
                func.count(Notification.id).label('count')
            )
            .group_by(Notification.type)
        ).all()
        
        if stats:
            print("Статистика по типам:")
            for type_name, count in stats:
                print(f"  {type_name}: {count}")
        
        print("=" * 80)

if __name__ == "__main__":
    main()



