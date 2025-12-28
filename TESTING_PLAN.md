# План тестирования и проверки работоспособности

## Текущее состояние базы данных

**По умолчанию используется SQLite:**
- Путь: `sqlite:///../calendar.db` (относительно backend/)
- Файл: `calendar.db` в корне проекта
- **Важно:** SQLite подходит для разработки, но для production с 200+ пользователями рекомендуется PostgreSQL

**Поддержка PostgreSQL:**
- Настроен connection pooling (20 базовых + 40 overflow)
- Миграции поддерживают оба типа БД
- Для переключения измените `DATABASE_URL` в `.env`

---

## Быстрая проверка работоспособности

### 1. Проверка зависимостей

```bash
cd backend
pip install -r requirements.txt
```

**Проверьте, что установлены:**
- ✅ fastapi, uvicorn
- ✅ sqlmodel, alembic
- ✅ slowapi (для rate limiting)
- ✅ psycopg (для PostgreSQL, опционально)

### 2. Проверка конфигурации

```bash
cd backend
python -c "from app.core.config import settings; print(f'DB: {settings.DATABASE_URL}'); print(f'Env: {settings.ENVIRONMENT}')"
```

**Ожидаемый вывод:**
- `DB: sqlite:///../calendar.db` (или PostgreSQL URL)
- `Env: local` (или development/production)

### 3. Проверка миграций

```bash
cd backend
alembic current  # Проверить текущую версию
alembic history   # Показать все миграции
```

**Если миграции не применены:**
```bash
alembic upgrade head
```

### 4. Запуск сервера

```bash
cd backend
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

**Проверка запуска:**
- Откройте http://localhost:8000/docs
- Должна открыться Swagger документация

### 5. Проверка health endpoints

```bash
# Health check (liveness)
curl http://localhost:8000/api/v1/health/

# Readiness check (проверка БД)
curl http://localhost:8000/api/v1/health/ready
```

**Ожидаемый ответ:**
```json
{"status": "ok"}
{"status": "ready", "database": "connected"}
```

### 6. Проверка rate limiting

```bash
# Попробуйте сделать 6 запросов на регистрацию за минуту
for i in {1..6}; do
  curl -X POST http://localhost:8000/api/v1/auth/register \
    -H "Content-Type: application/json" \
    -d '{"email":"test@test.com","password":"test123","full_name":"Test"}'
  echo ""
done
```

**Ожидаемое поведение:**
- Первые 5 запросов: 400 (email уже существует) или 201 (успех)
- 6-й запрос: 429 (Rate limit exceeded)

### 7. Проверка кеширования

```bash
# Войдите и сделайте несколько запросов
# Кеш должен работать автоматически для get_current_user
# Проверьте логи - не должно быть множественных запросов к БД для одного пользователя
```

---

## Полное тестирование API

### 1. Регистрация пользователя

```bash
curl -X POST http://localhost:8000/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "Test123!",
    "full_name": "Test User"
  }'
```

### 2. Вход в систему

```bash
curl -X POST http://localhost:8000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "Test123!"
  }'
```

**Сохраните токен из ответа!**

### 3. Проверка аутентификации

```bash
TOKEN="ваш_access_token_здесь"

curl -X GET http://localhost:8000/api/v1/calendars/ \
  -H "Authorization: Bearer $TOKEN"
```

### 4. Создание календаря

```bash
curl -X POST http://localhost:8000/api/v1/calendars/ \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test Calendar",
    "description": "Test description"
  }'
```

### 5. Создание события

```bash
CALENDAR_ID="uuid_календаря_здесь"

curl -X POST http://localhost:8000/api/v1/events/ \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "calendar_id": "'$CALENDAR_ID'",
    "title": "Test Event",
    "starts_at": "2025-12-27T10:00:00",
    "ends_at": "2025-12-27T11:00:00"
  }'
```

### 6. Проверка пагинации

```bash
curl -X GET "http://localhost:8000/api/v1/events/?skip=0&limit=10" \
  -H "Authorization: Bearer $TOKEN"
```

---

## Проверка производительности

### 1. Проверка connection pooling (только для PostgreSQL)

```bash
# Подключитесь к PostgreSQL и проверьте активные соединения
psql -U planner_user -d planner_db -c "SELECT count(*) FROM pg_stat_activity WHERE datname = 'planner_db';"
```

**Ожидаемое:** Не более 20-60 активных соединений (pool_size + max_overflow)

### 2. Проверка индексов

```bash
# Для SQLite
sqlite3 calendar.db ".indices"

# Для PostgreSQL
psql -U planner_user -d planner_db -c "\di"
```

**Должны быть индексы:**
- `ix_event_participants_event_id_user_id`
- `ix_notifications_user_id_is_read_created_at`
- И другие из миграции `1e3cd8ed31cb`

### 3. Проверка кеширования

```bash
# Сделайте несколько запросов с одним токеном
# В логах не должно быть множественных SELECT для одного пользователя
# (кеш работает 5 минут)
```

---

## Проверка безопасности

### 1. CORS

```bash
curl -X OPTIONS http://localhost:8000/api/v1/calendars/ \
  -H "Origin: http://localhost:3000" \
  -H "Access-Control-Request-Method: GET" \
  -v
```

**Проверьте заголовки:**
- `Access-Control-Allow-Origin: http://localhost:3000`
- `Access-Control-Allow-Credentials: true`

### 2. Security Headers

```bash
curl -I http://localhost:8000/api/v1/health/
```

**Проверьте заголовки:**
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `X-XSS-Protection: 1; mode=block`
- `Strict-Transport-Security: max-age=31536000; includeSubDomains`

### 3. Rate Limiting

```bash
# См. раздел "Проверка rate limiting" выше
```

---

## Автоматизированный скрипт проверки

См. файл `check_system.py` (будет создан)

---

## Следующие шаги после проверки

1. ✅ Если все работает - можно деплоить на сервер
2. ⚠️ Если есть ошибки - проверьте логи и исправьте
3. 🔄 Для production - переключитесь на PostgreSQL
4. 📊 Настройте мониторинг (Prometheus, Grafana)
5. 🔒 Настройте SSL сертификаты (Let's Encrypt)


