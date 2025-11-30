from sqlmodel import Session, select
from app.db import engine
from app.models import Event

with Session(engine) as session:
    events = session.exec(select(Event).order_by(Event.created_at.desc()).limit(5)).all()
    print("Последние 5 событий в БД:")
    print("-" * 80)
    for e in events:
        print(f"ID: {e.id}")
        print(f"Title: {e.title}")
        print(f"Starts_at (UTC): {e.starts_at}")
        print(f"Ends_at (UTC): {e.ends_at}")
        print(f"All_day: {e.all_day}")
        print(f"Created_at: {e.created_at}")
        print("-" * 80)


