#!/usr/bin/env python3
"""Скрипт для управления пользователями: просмотр списка и сброс пароля."""

import sys
from pathlib import Path

# Добавляем корневую директорию backend в путь
BASE_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BASE_DIR))

from sqlmodel import Session, select
from app.db import engine
from app.models import User
from app.core.security import get_password_hash


def list_users():
    """Выводит список всех пользователей."""
    print("=" * 80)
    print("Список пользователей")
    print("=" * 80)
    
    with Session(engine) as session:
        users = session.exec(select(User).order_by(User.email)).all()
        
        if not users:
            print("Пользователи не найдены")
            return
        
        print(f"\nВсего пользователей: {len(users)}\n")
        print(f"{'Email':<40} {'ФИО':<30} {'Роль':<15} {'ID':<40}")
        print("-" * 80)
        
        for user in users:
            full_name = user.full_name or "(не указано)"
            print(f"{user.email:<40} {full_name:<30} {user.role:<15} {str(user.id):<40}")
        
        print("=" * 80)


def reset_password():
    """Сбрасывает пароль для пользователя."""
    print("=" * 80)
    print("Сброс пароля пользователя")
    print("=" * 80)
    
    email = input("\nEmail пользователя: ").strip().lower()
    if not email:
        print("Ошибка: Email обязателен")
        return
    
    with Session(engine) as session:
        user = session.exec(select(User).where(User.email == email)).first()
        
        if not user:
            print(f"\n✗ Пользователь с email {email} не найден!")
            return
        
        print(f"\nНайден пользователь:")
        print(f"  Email: {user.email}")
        print(f"  ФИО: {user.full_name or '(не указано)'}")
        print(f"  Роль: {user.role}")
        
        new_password = input("\nНовый пароль: ").strip()
        if not new_password:
            print("Ошибка: Пароль обязателен")
            return
        
        confirm = input("Подтвердите пароль: ").strip()
        if new_password != confirm:
            print("Ошибка: Пароли не совпадают")
            return
        
        # Обновляем пароль
        user.hashed_password = get_password_hash(new_password)
        session.add(user)
        session.commit()
        
        print(f"\n✓ Пароль успешно обновлен для пользователя {user.email}")
        print("=" * 80)


def main():
    """Главная функция."""
    while True:
        print("\n" + "=" * 80)
        print("Управление пользователями")
        print("=" * 80)
        print("1. Показать список пользователей")
        print("2. Сбросить пароль")
        print("3. Выход")
        print("=" * 80)
        
        choice = input("\nВыберите действие (1-3): ").strip()
        
        if choice == "1":
            list_users()
        elif choice == "2":
            reset_password()
        elif choice == "3":
            print("\nВыход...")
            break
        else:
            print("\n✗ Неверный выбор. Попробуйте снова.")


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\n\nОтменено пользователем")
    except Exception as e:
        print(f"\n✗ Ошибка: {e}")
        import traceback
        traceback.print_exc()

