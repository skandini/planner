# Быстрое решение проблемы с миграциями

## Проблема
Ошибка: `Can't locate revision identified by 'add_composite_indexes'`

## Решение 1: Использовать Python скрипт (рекомендуется)

Скрипт автоматически использует настройки из `.env` файла:

```bash
cd /opt/planner/backend
source .venv/bin/activate

# 1. Получить последние изменения из GitHub
git pull origin testmain-copy

# 2. Проверить текущую версию миграции
python check_migration_version.py

# 3. Обновить версию до последней реальной
python check_migration_version.py --update

# 4. Попробовать миграции снова
alembic upgrade head
```

## Решение 2: Получить DATABASE_URL из .env

Если нужно подключиться через psql напрямую:

```bash
cd /opt/planner/backend
source .venv/bin/activate

# Посмотреть DATABASE_URL из .env
grep DATABASE_URL .env

# DATABASE_URL обычно выглядит так:
# postgresql://user:password@host:port/database
# или
# postgresql+psycopg://user:password@host:port/database

# Распарсить и подключиться (замените на реальные значения):
# Например, если DATABASE_URL = postgresql://planner_user:password123@localhost:5432/planner_db
# то команда будет:
psql -h localhost -U planner_user -d planner_db -c "SELECT version_num FROM alembic_version;"

# Обновить версию:
psql -h localhost -U planner_user -d planner_db -c "UPDATE alembic_version SET version_num = '20309e2890d1';"
```

## Решение 3: Использовать Alembic напрямую (без psql)

```bash
cd /opt/planner/backend
source .venv/bin/activate

# Проверить текущую версию
alembic current

# Установить последнюю версию (stamp head)
alembic stamp head

# Или установить конкретную версию
alembic stamp 20309e2890d1

# Попробовать миграции
alembic upgrade head
```

## Решение 4: Использовать Python для подключения

```bash
cd /opt/planner/backend
source .venv/bin/activate

# Подключиться к БД через Python
python -c "
from app.core.config import settings
from sqlalchemy import create_engine, text
engine = create_engine(settings.DATABASE_URL)
with engine.connect() as conn:
    result = conn.execute(text('SELECT version_num FROM alembic_version;'))
    print('Текущая версия:', result.scalar())
    conn.execute(text(\"UPDATE alembic_version SET version_num = '20309e2890d1';\"))
    conn.commit()
    print('Версия обновлена')
"
```

## После исправления миграций

```bash
# Проверить миграции
alembic current
alembic upgrade head

# Остановить процесс на порту 8000 (если нужно)
sudo pkill -f uvicorn

# Запустить сервер
uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers 4
```

