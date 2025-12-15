#!/usr/bin/env python3
"""Скрипт для создания нового пользователя в БД."""

import sys
from pathlib import Path

# Добавляем корневую директорию backend в путь
BASE_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BASE_DIR))

from sqlmodel import Session
from app.db import engine
from app.models import User
from app.core.security import get_password_hash

def create_user():
    """Создает нового пользователя."""
    print("=" * 60)
    print("Создание нового пользователя")
    print("=" * 60)
    
    email = input("Email: ").strip()
    if not email:
        print("Ошибка: Email обязателен")
        return
    
    full_name = input("ФИО (необязательно): ").strip() or None
    password = input("Пароль: ").strip()
    if not password:
        print("Ошибка: Пароль обязателен")
        return
    
    role = input("Роль (admin/it/employee, по умолчанию employee): ").strip() or "employee"
    
    with Session(engine) as session:
        # Проверяем, существует ли пользователь
        from sqlmodel import select
        existing = session.exec(
            select(User).where(User.email == email.lower())
        ).first()
        
        if existing:
            print(f"\nПользователь с email {email} уже существует!")
            response = input("Обновить существующего пользователя? (y/n): ").strip().lower()
            if response != 'y':
                print("Отменено")
                return
            user = existing
            user.full_name = full_name
            user.hashed_password = get_password_hash(password)
            user.role = role
            user.access_org_structure = True
            user.access_tickets = True
        else:
            user = User(
                email=email.lower(),
                full_name=full_name,
                hashed_password=get_password_hash(password),
                role=role,
                access_org_structure=True,
                access_tickets=True,
            )
            session.add(user)
        
        session.commit()
        session.refresh(user)
        
        print(f"\n✓ Пользователь {'обновлен' if existing else 'создан'} успешно!")
        print(f"  ID: {user.id}")
        print(f"  Email: {user.email}")
        print(f"  ФИО: {user.full_name or '(не указано)'}")
        print(f"  Роль: {user.role}")
        print("=" * 60)

if __name__ == "__main__":
    try:
        create_user()
    except KeyboardInterrupt:
        print("\n\nОтменено пользователем")
    except Exception as e:
        print(f"\n✗ Ошибка: {e}")
        import traceback
        traceback.print_exc()

