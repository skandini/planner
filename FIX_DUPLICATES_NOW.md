# Быстрое решение дубликатов в alembic_version

## Проблема
В таблице `alembic_version` несколько записей (включая несуществующие миграции), а должна быть только ОДНА.

## Решение: Удалить все и оставить одну запись

```bash
cd /opt/planner/backend
source .venv/bin/activate

# 1. Посмотреть все записи в таблице
psql -h localhost -U planner_user -d planner_db -c "SELECT version_num FROM alembic_version;"

# 2. Удалить ВСЕ записи из таблицы
psql -h localhost -U planner_user -d planner_db -c "DELETE FROM alembic_version;"

# 3. Вставить одну правильную запись с текущей версией
psql -h localhost -U planner_user -d planner_db -c "INSERT INTO alembic_version (version_num) VALUES ('22a45ee15fd2');"

# 4. Проверить, что осталась только одна запись
psql -h localhost -U planner_user -d planner_db -c "SELECT version_num FROM alembic_version;"

# 5. Теперь попробовать миграции
alembic upgrade head
```

## Или использовать обновленный скрипт

```bash
cd /opt/planner/backend
source .venv/bin/activate

# Получить обновления
git pull origin testmain-copy

# Очистить дубликаты и обновить версию
python check_migration_version.py --update

# Попробовать миграции
alembic upgrade head
```

## Альтернатива: Использовать Alembic stamp

```bash
cd /opt/planner/backend
source .venv/bin/activate

# Удалить все записи
psql -h localhost -U planner_user -d planner_db -c "DELETE FROM alembic_version;"

# Установить текущую версию через Alembic
alembic stamp 22a45ee15fd2

# Или установить последнюю версию
alembic stamp head

# Попробовать миграции
alembic upgrade head
```

