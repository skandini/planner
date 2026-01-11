# Применение миграции 20309e2890d1 вручную

## Проблема
Миграция `20309e2890d1_add_branding_and_avatars` не входит в цепочку миграций от `22a45ee15fd2`, поэтому `alembic upgrade head` её не применяет.

Нужно добавить колонки `logo_url`, `primary_color`, `secondary_color` в таблицу `organizations` вручную.

## Решение 1: Применить миграцию через SQL напрямую

```bash
cd /opt/planner/backend
source .venv/bin/activate

# 1. Добавить колонки в таблицу organizations
psql -h localhost -U planner_user -d planner_db -c "
ALTER TABLE organizations 
ADD COLUMN logo_url VARCHAR(500),
ADD COLUMN primary_color VARCHAR(7),
ADD COLUMN secondary_color VARCHAR(7);
"

# 2. Добавить колонку avatar_url в таблицу users (если её тоже нет)
psql -h localhost -U planner_user -d planner_db -c "
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS avatar_url VARCHAR(500);
"

# 3. Проверить, что колонки добавлены
psql -h localhost -U planner_user -d planner_db -c "\d organizations"

# 4. Перезапустить сервер
sudo systemctl restart planner-backend

# 5. Проверить логи
sudo journalctl -u planner-backend -f --lines 50
```

## Решение 2: Использовать Alembic напрямую (если миграция существует)

```bash
cd /opt/planner/backend
source .venv/bin/activate

# 1. Проверить, существует ли миграция 20309e2890d1
ls -la migrations/versions/ | grep 20309e2890d1

# 2. Попробовать применить конкретную миграцию
alembic upgrade 20309e2890d1

# 3. Если это не работает, использовать SQL (см. Решение 1)
```

## Решение 3: Проверить цепочку миграций и применить все

```bash
cd /opt/planner/backend
source .venv/bin/activate

# 1. Посмотреть историю миграций
alembic history

# 2. Посмотреть текущую версию
alembic current

# 3. Посмотреть heads (концы веток миграций)
alembic heads

# 4. Если есть несколько heads, нужно смержить их или применить вручную
```

## После применения миграции

```bash
# Проверить структуру таблицы
psql -h localhost -U planner_user -d planner_db -c "\d organizations"

# Должны появиться колонки:
# logo_url      | character varying(500) |          |
# primary_color | character varying(7)   |          |
# secondary_color | character varying(7) |          |

# Перезапустить сервер
sudo systemctl restart planner-backend

# Проверить работу
sudo journalctl -u planner-backend -f --lines 50
```

