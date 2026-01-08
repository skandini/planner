# Исправление зависаний приложения

## Проблема
Приложение зависает и работает не плавно, даже после всех оптимизаций.

## Возможные причины

### 1. Медленные запросы к БД
- Отсутствие индексов (исправлено ✅)
- N+1 запросы (частично исправлено ✅)
- Блокировки в БД
- Большие запросы без пагинации

### 2. Проблемы с соединениями
- Переполнение пула подключений
- Долгие транзакции
- Утечки соединений

### 3. Отсутствие кеширования
- Частые запросы к БД для одних и тех же данных
- Нет кеширования календарей, событий, пользователей

### 4. Проблемы с фронтендом
- Большие запросы без пагинации
- Отсутствие debounce для поиска
- Много одновременных запросов

## Решения

### 1. Диагностика (выполнить на сервере)

```bash
cd /opt/planner
chmod +x scripts/diagnose_performance.sh
sudo ./scripts/diagnose_performance.sh
```

Этот скрипт покажет:
- Медленные запросы к БД
- Блокировки в БД
- Использование ресурсов
- Очередь Celery
- Ошибки в логах
- Подключения к БД
- Использование индексов

### 2. Проверить медленные запросы вручную

```bash
# Подключиться к БД
PGPASSWORD=YtragtR65A psql -U planner_user -d planner_db -h localhost

# Включить логирование медленных запросов
ALTER SYSTEM SET log_min_duration_statement = 1000;  # Логировать запросы > 1 сек
SELECT pg_reload_conf();

# Проверить медленные запросы
SELECT pid, now() - pg_stat_activity.query_start AS duration, query 
FROM pg_stat_activity 
WHERE state = 'active' 
  AND query NOT LIKE '%pg_stat_activity%'
ORDER BY duration DESC;
```

### 3. Добавить пагинацию для больших списков

Если в API нет пагинации, нужно добавить:

```python
# В backend/app/api/v1/events.py
@router.get("/", response_model=List[EventRead])
def list_events(
    session: SessionDep,
    current_user: User = Depends(get_current_user),
    calendar_id: Optional[UUID] = None,
    starts_after: Optional[datetime] = Query(default=None, alias="from"),
    ends_before: Optional[datetime] = Query(default=None, alias="to"),
    limit: int = Query(default=100, le=500),  # Добавить лимит
    offset: int = Query(default=0),  # Добавить offset
) -> List[EventRead]:
    # ... существующий код ...
    statement = statement.order_by(Event.starts_at).limit(limit).offset(offset)
    # ...
```

### 4. Добавить кеширование

Использовать существующий Redis кеш:

```python
# В backend/app/api/v1/events.py
from app.core.cache import get_cache

cache = get_cache()

@router.get("/", response_model=List[EventRead])
def list_events(...):
    # Создать ключ кеша
    cache_key = f"events:user:{current_user.id}:cal:{calendar_id}:from:{starts_after}:to:{ends_before}"
    
    # Попробовать получить из кеша
    cached = cache.get(cache_key)
    if cached:
        return cached
    
    # Выполнить запрос
    events = session.exec(statement).all()
    # ... обработка ...
    
    # Сохранить в кеш на 2 минуты
    cache.set(cache_key, serialized, ttl=120)
    return serialized
```

### 5. Оптимизировать запросы с JOIN

Проверить, что используются правильные JOIN:

```python
# Вместо множественных запросов использовать один JOIN
from sqlalchemy.orm import joinedload

events = session.exec(
    select(Event)
    .options(
        joinedload(Event.participants).joinedload(EventParticipant.user),
        joinedload(Event.attachments),
        joinedload(Event.room)
    )
    .where(...)
).all()
```

### 6. Проверить фронтенд

Если фронтенд делает много запросов:

```typescript
// Добавить debounce для поиска
import { debounce } from 'lodash';

const debouncedSearch = debounce((query: string) => {
  // выполнить поиск
}, 300);

// Кешировать результаты
const [cache, setCache] = useState<Map<string, any>>(new Map());

// Использовать пагинацию
const [page, setPage] = useState(1);
const [limit, setLimit] = useState(50);
```

## Быстрая проверка

Выполните на сервере:

```bash
# 1. Проверить медленные запросы
PGPASSWORD=YtragtR65A psql -U planner_user -d planner_db -h localhost -c "
SELECT pid, now() - pg_stat_activity.query_start AS duration, 
       left(query, 100) as query
FROM pg_stat_activity 
WHERE state = 'active' 
  AND query NOT LIKE '%pg_stat_activity%'
ORDER BY duration DESC 
LIMIT 5;"

# 2. Проверить использование ресурсов
htop

# 3. Проверить логи
sudo journalctl -u planner-backend --since "5 minutes ago" | tail -50
```

## Следующие шаги

1. ✅ Выполнить диагностику
2. ✅ Найти медленные запросы
3. ✅ Добавить пагинацию если нужно
4. ✅ Добавить кеширование
5. ✅ Оптимизировать фронтенд запросы

После диагностики будет понятно, что именно вызывает зависания.

