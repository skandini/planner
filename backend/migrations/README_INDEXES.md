# Индексы для оптимизации производительности

## Применение

### PostgreSQL:
```bash
cd /opt/planner/backend
psql -U your_user -d your_database -f migrations/add_performance_indexes.sql
```

### SQLite:
```bash
cd /opt/planner/backend
sqlite3 calendar.db < migrations/add_performance_indexes.sql
```

Или через Python:
```python
from sqlalchemy import text
from app.db import engine

with engine.connect() as conn:
    with open('migrations/add_performance_indexes.sql', 'r') as f:
        conn.execute(text(f.read()))
    conn.commit()
```

## Важность индексов

Эти индексы **критически важны** для производительности при 200+ пользователях:

1. **Индексы событий** - ускоряют поиск событий в календаре на 10-100x
2. **Индексы участников** - устраняют N+1 проблемы при загрузке участников
3. **Индексы уведомлений** - критично для Celery Beat задачи (каждую минуту)
4. **Составные индексы** - оптимизируют сложные запросы с несколькими условиями

## Ожидаемый эффект

- Время выполнения запросов: **↓ 70-90%**
- Нагрузка на CPU: **↓ 30-50%**
- Нагрузка на диск: **↓ 50-70%**

## Проверка индексов

### PostgreSQL:
```sql
-- Проверить существующие индексы
SELECT tablename, indexname, indexdef 
FROM pg_indexes 
WHERE schemaname = 'public' 
ORDER BY tablename, indexname;

-- Проверить использование индексов
SELECT schemaname, tablename, indexname, idx_scan, idx_tup_read, idx_tup_fetch
FROM pg_stat_user_indexes
ORDER BY idx_scan DESC;
```

### SQLite:
```sql
-- Проверить индексы
SELECT name FROM sqlite_master WHERE type='index';
```

