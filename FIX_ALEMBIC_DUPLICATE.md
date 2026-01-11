# Решение проблемы с дубликатами в alembic_version

## Проблема
В таблице `alembic_version` есть ДВЕ записи вместо одной:
- `22a45ee15fd2` (реальная миграция)
- `add_composite_indexes` (несуществующая миграция)

Alembic ожидает ТОЛЬКО ОДНУ запись в этой таблице.

## Решение: Удалить несуществующую миграцию

```bash
cd /opt/planner/backend
source .venv/bin/activate

# 1. Удалить запись с несуществующей миграцией 'add_composite_indexes'
psql -h localhost -U planner_user -d planner_db -c "DELETE FROM alembic_version WHERE version_num = 'add_composite_indexes';"

# 2. Проверить, что осталась только одна запись
psql -h localhost -U planner_user -d planner_db -c "SELECT version_num FROM alembic_version;"

# 3. Должна остаться только: 22a45ee15fd2
# Если нужно, можно обновить до последней версии:
psql -h localhost -U planner_user -d planner_db -c "UPDATE alembic_version SET version_num = '22a45ee15fd2';"

# 4. Попробовать миграции снова
alembic upgrade head
```

## Альтернативное решение: Полная очистка и переустановка

Если первое решение не работает:

```bash
cd /opt/planner/backend
source .venv/bin/activate

# 1. Удалить ВСЕ записи из alembic_version
psql -h localhost -U planner_user -d planner_db -c "DELETE FROM alembic_version;"

# 2. Установить текущую версию как последнюю реальную
alembic stamp head

# Или установить конкретную версию (22a45ee15fd2 - текущая в БД)
alembic stamp 22a45ee15fd2

# 3. Попробовать миграции
alembic upgrade head
```

## Если нужно обновить до последней версии

Если структура БД уже актуальна и нужно просто обновить версию:

```bash
# Удалить несуществующую миграцию
psql -h localhost -U planner_user -d planner_db -c "DELETE FROM alembic_version WHERE version_num = 'add_composite_indexes';"

# Установить последнюю версию (20309e2890d1)
alembic stamp 20309e2890d1

# Или через SQL:
psql -h localhost -U planner_user -d planner_db -c "UPDATE alembic_version SET version_num = '20309e2890d1' WHERE version_num = '22a45ee15fd2';"
```

