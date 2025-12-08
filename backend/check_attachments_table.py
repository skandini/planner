"""Проверка существования таблицы event_attachments"""
import sys
from pathlib import Path

sys.path.append(str(Path(__file__).resolve().parent))

from sqlmodel import Session, select, text
from app.db import engine
from app.models import EventAttachment

def check_table():
    with Session(engine) as session:
        try:
            # Пробуем выполнить простой запрос к таблице
            result = session.exec(text("SELECT name FROM sqlite_master WHERE type='table' AND name='event_attachments'"))
            table_exists = result.first() is not None
            if table_exists:
                print("[OK] Table event_attachments exists")
                # Пробуем получить количество записей
                count = session.exec(select(EventAttachment)).all()
                print(f"  Records in table: {len(count)}")
            else:
                print("[ERROR] Table event_attachments does NOT exist")
                print("  Run migration: python -m alembic upgrade head")
        except Exception as e:
            print(f"[ERROR] Error checking table: {e}")
            print("  Maybe need to run migration: python -m alembic upgrade head")

if __name__ == "__main__":
    check_table()

