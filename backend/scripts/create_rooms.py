"""
Скрипт для создания переговорок.

Использование:
    python scripts/create_rooms.py
"""

import sys
from pathlib import Path

# Добавляем корневую директорию backend в путь
BASE_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BASE_DIR))

from sqlmodel import Session, select
from app.db import engine
from app.models.room import Room


def create_rooms():
    """Создает переговорки, если их еще нет."""
    with Session(engine) as session:
        try:
            # Проверяем, есть ли уже переговорки
            existing_rooms = session.exec(select(Room)).all()
            if existing_rooms:
                print(f"Найдено {len(existing_rooms)} переговорок:")
                for room in existing_rooms:
                    print(f"  - {room.name}")
                return

            rooms_data = [
                {
                    "name": "Переговорка 301",
                    "description": "Комфортная переговорная комната на 10 человек",
                    "capacity": 10,
                    "location": "3 этаж",
                    "equipment": "Проектор, доска, видеоконференция",
                    "is_active": True,
                },
                {
                    "name": "Переговорка 205",
                    "description": "Малая переговорная комната на 6 человек",
                    "capacity": 6,
                    "location": "2 этаж",
                    "equipment": "Проектор, доска",
                    "is_active": True,
                },
                {
                    "name": "Конференц-зал",
                    "description": "Большой конференц-зал на 20 человек",
                    "capacity": 20,
                    "location": "1 этаж",
                    "equipment": "Проектор, микрофоны, сцена",
                    "is_active": True,
                },
            ]

            print("Создание переговорок...")
            for room_data in rooms_data:
                room = Room(**room_data)
                session.add(room)
                print(f"  [OK] {room.name}")

            session.commit()
            print(f"\n[OK] Успешно создано {len(rooms_data)} переговорок")

        except Exception as e:
            session.rollback()
            print(f"\n[ERROR] Ошибка при создании переговорок: {e}")
            raise


if __name__ == "__main__":
    print("=" * 60)
    print("Создание переговорок")
    print("=" * 60)
    create_rooms()
    print("=" * 60)

