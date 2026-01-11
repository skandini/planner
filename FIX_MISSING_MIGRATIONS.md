# Решение проблемы с отсутствующими колонками

## Проблема
База данных на версии миграции `22a45ee15fd2`, но код пытается использовать колонки:
- `organizations.logo_url`
- `organizations.primary_color`
- `organizations.secondary_color`

Эти колонки должны быть добавлены миграцией `20309e2890d1_add_branding_and_avatars`, которая не была применена.

## Решение: Применить недостающие миграции

```bash
cd /opt/planner/backend
source .venv/bin/activate

# 1. Проверить текущую версию миграции
alembic current

# 2. Проверить, какие миграции нужно применить
alembic heads
alembic history

# 3. Применить все недостающие миграции
alembic upgrade head

# 4. Проверить, что миграции применены
alembic current

# 5. Перезапустить сервер
sudo systemctl restart planner-backend

# 6. Проверить логи
sudo journalctl -u planner-backend -f --lines 50
```

## Если миграции не применяются

Если `alembic upgrade head` не работает или показывает ошибки:

```bash
# 1. Проверить цепочку миграций
alembic history | head -20

# 2. Попробовать применить конкретную миграцию
alembic upgrade 20309e2890d1

# 3. Затем применить остальные
alembic upgrade head
```

## Проверка после применения миграций

```bash
# Проверить, что колонки добавлены в таблицу organizations
psql -h localhost -U planner_user -d planner_db -c "\d organizations"

# Должны быть колонки:
# logo_url
# primary_color
# secondary_color
```

