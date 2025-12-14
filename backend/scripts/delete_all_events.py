"""
Скрипт для удаления всех событий из базы данных, сохраняя календари и пользователей.

ВНИМАНИЕ: Этот скрипт удалит ВСЕ события, но сохранит:
- Календари
- Пользователей
- Участников календарей
- Организации
- Переговорки
- Все остальные данные

Использование:
    python scripts/delete_all_events.py
"""

import sys
from pathlib import Path

# Добавляем корневую директорию backend в путь
BASE_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BASE_DIR))

from sqlmodel import Session, select
from app.db import engine
from app.models.event import Event
from app.models.event_participant import EventParticipant
from app.models.event_attachment import EventAttachment


def delete_all_events():
    """Удаляет все события и связанные данные, сохраняя календари."""
    with Session(engine) as session:
        try:
            # Подсчитываем количество событий перед удалением
            events_count = session.exec(select(Event)).all()
            events_count = len(events_count)
            
            # Подсчитываем участников событий
            participants_count = session.exec(select(EventParticipant)).all()
            participants_count = len(participants_count)
            
            # Подсчитываем вложения
            attachments_count = session.exec(select(EventAttachment)).all()
            attachments_count = len(attachments_count)
            
            print(f"Найдено:")
            print(f"  - Событий: {events_count}")
            print(f"  - Участников событий: {participants_count}")
            print(f"  - Вложений: {attachments_count}")
            
            if events_count == 0:
                print("\nВ базе данных нет событий для удаления.")
                return
            
            # Подтверждение
            response = input(f"\nВы уверены, что хотите удалить все {events_count} событий? (yes/no): ")
            if response.lower() not in ['yes', 'y', 'да', 'д']:
                print("Операция отменена.")
                return
            
            # Удаляем вложения (если есть)
            if attachments_count > 0:
                print(f"\nУдаление {attachments_count} вложений...")
                attachments = session.exec(select(EventAttachment)).all()
                for attachment in attachments:
                    session.delete(attachment)
                print("✓ Вложения удалены")
            
            # Удаляем участников событий
            if participants_count > 0:
                print(f"Удаление {participants_count} записей участников...")
                participants = session.exec(select(EventParticipant)).all()
                for participant in participants:
                    session.delete(participant)
                print("✓ Участники событий удалены")
            
            # Удаляем события
            print(f"Удаление {events_count} событий...")
            events = session.exec(select(Event)).all()
            for event in events:
                session.delete(event)
            print("✓ События удалены")
            
            # Сохраняем изменения
            session.commit()
            
            print(f"\n✓ Успешно удалено:")
            print(f"  - {events_count} событий")
            print(f"  - {participants_count} записей участников")
            print(f"  - {attachments_count} вложений")
            print("\n✓ Календари, пользователи и все остальные данные сохранены.")
            
        except Exception as e:
            session.rollback()
            print(f"\n✗ Ошибка при удалении: {e}")
            raise


if __name__ == "__main__":
    print("=" * 60)
    print("Удаление всех событий из базы данных")
    print("=" * 60)
    delete_all_events()
    print("=" * 60)

