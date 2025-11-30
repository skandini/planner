from __future__ import annotations

from sqlmodel import Session, select

from app.db import engine
from app.models import User


def main() -> None:
    with Session(engine) as session:
        users = session.exec(select(User)).all()
        
        if not users:
            print("В базе данных нет пользователей")
            return
        
        print(f"Найдено пользователей: {len(users)}\n")
        for user in users:
            print(f"  Email: {user.email}")
            print(f"  Имя: {user.full_name}")
            print(f"  Активен: {user.is_active}")
            print(f"  Роль: {user.role}")
            print(f"  ID: {user.id}")
            print()


if __name__ == "__main__":
    main()

