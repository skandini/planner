"""
Скрипт для создания трех организаций:
- ООО "КОРСТОУН"
- ООО "ЭЛЕКТРОН Х"
- ООО "КТБ 1440"

Использование:
    python scripts/create_organizations.py
"""

import sys
from pathlib import Path

# Добавляем корневую директорию backend в путь
BASE_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BASE_DIR))

from sqlmodel import Session, select
from app.db import engine
from app.models import Organization


def create_organizations():
    """Создает три организации, если они еще не существуют."""
    with Session(engine) as session:
        organizations_data = [
            {
                "name": 'ООО "КОРСТОУН"',
                "slug": "korstoun",
                "timezone": "Europe/Moscow",
                "description": "ООО КОРСТОУН",
            },
            {
                "name": 'ООО "ЭЛЕКТРОН Х"',
                "slug": "elektron-x",
                "timezone": "Europe/Moscow",
                "description": "ООО ЭЛЕКТРОН Х",
            },
            {
                "name": 'ООО "КТБ 1440"',
                "slug": "ktb-1440",
                "timezone": "Europe/Moscow",
                "description": "ООО КТБ 1440",
            },
        ]
        
        created_count = 0
        for org_data in organizations_data:
            # Проверяем, существует ли организация с таким slug
            existing = session.exec(
                select(Organization).where(Organization.slug == org_data["slug"])
            ).one_or_none()
            
            if existing:
                print(f"[OK] Организация '{org_data['name']}' уже существует (slug: {org_data['slug']})")
            else:
                organization = Organization(**org_data)
                session.add(organization)
                session.commit()
                session.refresh(organization)
                print(f"[OK] Создана организация: {org_data['name']} (slug: {org_data['slug']})")
                created_count += 1
        
        if created_count == 0:
            print("\nВсе организации уже существуют.")
        else:
            print(f"\n[OK] Создано организаций: {created_count}")


if __name__ == "__main__":
    print("=" * 60)
    print("Создание организаций")
    print("=" * 60)
    create_organizations()
    print("=" * 60)
