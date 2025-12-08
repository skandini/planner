"""Скрипт для создания юридических лиц"""
import sys
from pathlib import Path

sys.path.append(str(Path(__file__).resolve().parent.parent))

from sqlmodel import Session, select
from app.db import engine
from app.models import Organization


def create_organizations():
    """Создать юридические лица если их нет."""
    organizations_data = [
        {"name": 'ООО "КОРСТОУН"', "slug": "corstone", "timezone": "Europe/Moscow"},
        {"name": 'ООО "ЭЛЕКТРОН Х"', "slug": "electron-x", "timezone": "Europe/Moscow"},
        {"name": 'ООО "КТБ1440"', "slug": "ktb1440", "timezone": "Europe/Moscow"},
    ]

    with Session(engine) as session:
        for org_data in organizations_data:
            # Проверяем, существует ли уже организация с таким slug
            existing = session.exec(
                select(Organization).where(Organization.slug == org_data["slug"])
            ).first()

            if existing:
                print(f"Организация {org_data['name']} уже существует (slug: {org_data['slug']})")
            else:
                organization = Organization(**org_data)
                session.add(organization)
                session.commit()
                session.refresh(organization)
                print(f"Создана организация: {org_data['name']} (id: {organization.id})")

        print("\nВсе организации созданы!")


if __name__ == "__main__":
    create_organizations()

