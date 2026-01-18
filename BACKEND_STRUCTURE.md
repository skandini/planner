# 🏗️ Структура Backend приложения Planner

Подробное описание архитектуры и структуры backend части приложения.

---

## 📁 Структура директорий

```
backend/
├── .venv/                      # Виртуальное окружение Python
├── app/                        # Основной код приложения
│   ├── __init__.py
│   ├── main.py                 # Точка входа приложения
│   ├── db.py                   # Подключение к базе данных
│   │
│   ├── api/                    # API endpoints
│   │   ├── __init__.py
│   │   ├── router.py          # Главный роутер API
│   │   ├── deps.py            # Зависимости (auth, sessions)
│   │   └── v1/                # API версии 1
│   │       ├── __init__.py
│   │       ├── auth.py        # Аутентификация
│   │       ├── users.py       # Управление пользователями
│   │       ├── calendars.py   # Календари
│   │       ├── events.py      # События
│   │       ├── rooms.py       # Переговорные комнаты
│   │       ├── tickets.py     # Система тикетов
│   │       ├── notifications.py  # Уведомления
│   │       ├── departments.py    # Отделы
│   │       ├── organizations.py  # Организации
│   │       ├── statistics.py     # Статистика
│   │       ├── health.py         # Health check
│   │       └── ...
│   │
│   ├── core/                   # Ядро приложения
│   │   ├── __init__.py
│   │   ├── config.py          # Конфигурация (Settings)
│   │   ├── security.py        # Безопасность (JWT, хэширование)
│   │   └── database.py        # Настройки БД
│   │
│   ├── models/                 # SQLModel модели (таблицы БД)
│   │   ├── __init__.py
│   │   ├── user.py            # Модель пользователя
│   │   ├── calendar.py        # Модель календаря
│   │   ├── event.py           # Модель события
│   │   ├── room.py            # Модель комнаты
│   │   ├── ticket.py          # Модель тикета
│   │   ├── notification.py    # Модель уведомления
│   │   ├── department.py      # Модель отдела
│   │   ├── organization.py    # Модель организации
│   │   └── ...
│   │
│   ├── schemas/                # Pydantic схемы (валидация)
│   │   ├── __init__.py
│   │   ├── user.py            # Схемы пользователя
│   │   ├── calendar.py        # Схемы календаря
│   │   ├── event.py           # Схемы события
│   │   └── ...
│   │
│   ├── services/               # Бизнес-логика
│   │   ├── __init__.py
│   │   ├── user_service.py    # Логика работы с пользователями
│   │   ├── event_service.py   # Логика работы с событиями
│   │   └── ...
│   │
│   └── tasks/                  # Celery задачи (фоновые)
│       ├── __init__.py
│       ├── email_tasks.py     # Email рассылки
│       ├── notification_tasks.py  # Уведомления
│       └── cleanup_tasks.py   # Очистка старых данных
│
├── uploads/                    # Загруженные файлы
│   └── .gitkeep
│
├── .env                        # Переменные окружения (НЕ в Git!)
├── requirements.txt            # Python зависимости
├── create_admin.py            # Скрипт создания админа
└── README.md                  # Документация backend
```

---

## 🎯 Основные компоненты

### 1. main.py - Точка входа

Главный файл приложения, создает FastAPI приложение:

```python
# Основные компоненты:
- FastAPI app инициализация
- CORS middleware (для cross-origin запросов)
- Rate limiting (защита от DDoS)
- Security headers (защита браузера)
- Exception handlers (обработка ошибок)
- Static files (для uploads)
- API router (подключение всех endpoints)
```

**Ключевые настройки:**
- Title: "Corporate Calendar API"
- Version: "0.1.0"
- Docs URL: `/docs` (Swagger UI)
- ReDoc URL: `/redoc`

### 2. db.py - База данных

Настройка подключения к PostgreSQL через SQLModel:

```python
# Компоненты:
- Engine (движок подключения)
- SessionLocal (фабрика сессий)
- SessionDep (зависимость для endpoints)
- init_db() (инициализация БД)
```

**Настройки подключения:**
- Pool size: по умолчанию
- Pool pre-ping: True (проверка соединений)
- Echo: False (логирование SQL)

### 3. core/config.py - Конфигурация

Класс `Settings` с настройками приложения:

```python
class Settings(BaseSettings):
    # Database
    DATABASE_URL: str
    
    # Redis
    REDIS_URL: str
    
    # Celery
    CELERY_BROKER_URL: str
    CELERY_RESULT_BACKEND: str
    
    # Security
    SECRET_KEY: str
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    
    # Environment
    ENVIRONMENT: str = "development"
    
    # CORS
    BACKEND_CORS_ORIGINS: str
    
    @property
    def cors_origins_list(self) -> List[str]:
        # Парсинг CORS origins
        ...
```

**Источник настроек:**
1. Переменные окружения
2. .env файл
3. Значения по умолчанию

### 4. core/security.py - Безопасность

Функции для работы с безопасностью:

```python
# JWT токены
def create_access_token(data: dict) -> str
def decode_token(token: str) -> dict

# Пароли
def get_password_hash(password: str) -> str
def verify_password(plain_password: str, hashed_password: str) -> bool

# Используется:
- passlib (bcrypt для хэширования)
- python-jose (JWT токены)
```

---

## 📊 Модели базы данных

### User (Пользователь)

```python
class User(SQLModel, table=True):
    __tablename__ = "users"
    
    id: UUID                    # Уникальный ID
    email: str                  # Email (уникальный)
    full_name: Optional[str]    # Полное имя
    phone: Optional[str]        # Телефон
    position: Optional[str]     # Должность
    department: Optional[str]   # Отдел
    department_id: Optional[UUID]  # FK -> departments
    manager_id: Optional[UUID]     # FK -> users (руководитель)
    avatar_url: Optional[str]      # URL аватара
    hashed_password: str           # Хэш пароля
    is_active: bool = True         # Активен ли
    role: str = "employee"         # Роль (admin/employee/it)
    created_at: datetime           # Дата создания
    organization_id: Optional[UUID]  # FK -> organizations
    
    # Настройки доступа
    access_org_structure: bool = True
    access_tickets: bool = True
    access_availability_slots: bool = False
    
    # Настройки отображения
    show_local_time: bool = True
    show_moscow_time: bool = True
    
    # День рождения
    birthday: Optional[date]
```

**Роли пользователей:**
- `admin` - полный доступ
- `it` - расширенный доступ (тикеты, система)
- `employee` - обычный пользователь

### Calendar (Календарь)

```python
class Calendar(SQLModel, table=True):
    id: UUID
    name: str                   # Название
    description: Optional[str]  # Описание
    color: str                  # Цвет (#hex)
    owner_id: UUID             # FK -> users
    is_public: bool = False    # Публичный ли
    organization_id: Optional[UUID]  # FK -> organizations
    created_at: datetime
    updated_at: datetime
```

### Event (Событие)

```python
class Event(SQLModel, table=True):
    id: UUID
    title: str                      # Название
    description: Optional[str]      # Описание
    start_time: datetime           # Начало
    end_time: datetime             # Конец
    location: Optional[str]        # Место
    calendar_id: UUID              # FK -> calendars
    organizer_id: UUID             # FK -> users
    room_id: Optional[UUID]        # FK -> rooms
    is_all_day: bool = False       # Весь день
    is_recurring: bool = False     # Повторяющееся
    recurrence_rule: Optional[str] # Правило повторения (RRULE)
    status: str = "confirmed"      # confirmed/tentative/cancelled
    created_at: datetime
    updated_at: datetime
```

**Связанные таблицы:**
- `event_participants` - участники события
- `event_attachments` - вложения
- `event_comments` - комментарии

### Room (Переговорная комната)

```python
class Room(SQLModel, table=True):
    id: UUID
    name: str                   # Название
    description: Optional[str]  # Описание
    capacity: int               # Вместимость
    location: Optional[str]     # Расположение
    equipment: Optional[str]    # Оборудование (JSON)
    is_active: bool = True      # Активна ли
    organization_id: Optional[UUID]
```

### Другие важные модели

- `Department` - отделы
- `Organization` - организации
- `Ticket` - тикеты/заявки
- `Notification` - уведомления
- `AvailabilitySlot` - слоты доступности
- `UserAvailability` - доступность пользователя

---

## 🔌 API Endpoints

### Аутентификация (`/api/v1/auth`)

```
POST   /auth/login          # Вход
POST   /auth/register       # Регистрация
POST   /auth/refresh        # Обновление токена
POST   /auth/logout         # Выход
GET    /auth/me             # Текущий пользователь
```

### Пользователи (`/api/v1/users`)

```
GET    /users               # Список пользователей
POST   /users               # Создать пользователя
GET    /users/{id}          # Получить пользователя
PUT    /users/{id}          # Обновить пользователя
DELETE /users/{id}          # Удалить пользователя
GET    /users/search        # Поиск пользователей
```

### Календари (`/api/v1/calendars`)

```
GET    /calendars           # Список календарей
POST   /calendars           # Создать календарь
GET    /calendars/{id}      # Получить календарь
PUT    /calendars/{id}      # Обновить календарь
DELETE /calendars/{id}      # Удалить календарь
```

### События (`/api/v1/events`)

```
GET    /events              # Список событий (?from=&to=)
POST   /events              # Создать событие
GET    /events/{id}         # Получить событие
PUT    /events/{id}         # Обновить событие
DELETE /events/{id}         # Удалить событие
POST   /events/{id}/participants  # Добавить участника
GET    /events/upcoming     # Предстоящие события
```

### Комнаты (`/api/v1/rooms`)

```
GET    /rooms               # Список комнат
POST   /rooms               # Создать комнату
GET    /rooms/{id}          # Получить комнату
PUT    /rooms/{id}          # Обновить комнату
DELETE /rooms/{id}          # Удалить комнату
GET    /rooms/available     # Доступные комнаты
```

### Служебные (`/api/v1`)

```
GET    /health              # Health check
GET    /statistics          # Статистика
```

---

## 🔒 Аутентификация и авторизация

### JWT токены

**Flow:**
1. Пользователь отправляет email/password на `/auth/login`
2. Backend проверяет креденшелы
3. Возвращает JWT access token
4. Клиент отправляет токен в заголовке: `Authorization: Bearer <token>`
5. Backend валидирует токен в `get_current_user` dependency

**Структура токена:**
```json
{
  "sub": "user_id",
  "exp": 1234567890,
  "type": "access"
}
```

**Время жизни:**
- Access token: 30 минут (настраивается)

### Зависимости (deps.py)

```python
# Получить текущего пользователя
def get_current_user(token: str) -> User:
    # Декодирует JWT, проверяет в БД, возвращает User
    ...

# Проверка роли админа/IT
def is_admin_or_it(current_user: User) -> User:
    if current_user.role not in ["admin", "it"]:
        raise HTTPException(403)
    return current_user

# Session dependency
SessionDep = Annotated[Session, Depends(get_session)]
```

---

## 🚀 Celery - Фоновые задачи

### Настройка (celery_app.py)

```python
from celery import Celery

app = Celery(
    "planner",
    broker=settings.CELERY_BROKER_URL,
    backend=settings.CELERY_RESULT_BACKEND,
)

app.conf.update(
    task_serializer='json',
    result_serializer='json',
    accept_content=['json'],
    timezone='UTC',
    enable_utc=True,
)

# Автообнаружение задач
app.autodiscover_tasks(['app.tasks'])
```

### Типы задач

**1. Email задачи (email_tasks.py)**
```python
@celery_app.task
def send_event_invitation(event_id: UUID, recipient_email: str):
    # Отправка приглашения на событие
    ...

@celery_app.task
def send_event_reminder(event_id: UUID):
    # Напоминание о событии за N минут
    ...
```

**2. Уведомления (notification_tasks.py)**
```python
@celery_app.task
def create_notification(user_id: UUID, message: str):
    # Создание уведомления в БД
    ...

@celery_app.task
def send_push_notification(user_id: UUID, data: dict):
    # Отправка push-уведомления
    ...
```

**3. Очистка (cleanup_tasks.py)**
```python
@celery_app.task
def cleanup_old_notifications():
    # Удаление старых уведомлений (>30 дней)
    ...

@celery_app.task
def cleanup_expired_tokens():
    # Очистка истекших токенов
    ...
```

### Celery Beat - Периодические задачи

```python
app.conf.beat_schedule = {
    'cleanup-notifications-daily': {
        'task': 'app.tasks.cleanup_tasks.cleanup_old_notifications',
        'schedule': crontab(hour=3, minute=0),  # Каждый день в 3:00
    },
    'send-event-reminders': {
        'task': 'app.tasks.email_tasks.send_event_reminders',
        'schedule': timedelta(minutes=5),  # Каждые 5 минут
    },
}
```

---

## 🔐 Безопасность

### Rate Limiting

```python
from slowapi import Limiter

limiter = Limiter(
    key_func=get_remote_address,
    storage_uri=settings.REDIS_URL,  # Хранение в Redis
    default_limits=["100/minute"],
)

# Использование в endpoint
@app.post("/api/v1/auth/login")
@limiter.limit("5/minute")  # Строгий лимит для логина
async def login(...):
    ...
```

### CORS

```python
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["*"],
)
```

### Security Headers

```python
@app.middleware("http")
async def add_security_headers(request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["X-XSS-Protection"] = "1; mode=block"
    if request.url.scheme == "https":
        response.headers["Strict-Transport-Security"] = "max-age=31536000"
    return response
```

---

## 📦 Зависимости (requirements.txt)

### Основные

```
fastapi>=0.109.0           # Web framework
uvicorn[standard]>=0.27.0  # ASGI server
sqlmodel>=0.0.14           # ORM
psycopg2-binary>=2.9.9     # PostgreSQL driver
redis>=5.0.1               # Redis client
celery>=5.3.4              # Task queue
python-jose[cryptography]  # JWT
passlib[bcrypt]            # Password hashing
slowapi>=0.1.9             # Rate limiting
```

### Установка

```bash
cd /opt/planner/backend
source .venv/bin/activate
pip install -r requirements.txt
```

---

## 🧪 Тестирование

### Структура тестов (будущее)

```
backend/tests/
├── __init__.py
├── conftest.py              # Pytest fixtures
├── test_auth.py            # Тесты аутентификации
├── test_users.py           # Тесты пользователей
├── test_events.py          # Тесты событий
└── test_api_endpoints.py   # Интеграционные тесты
```

### Запуск тестов

```bash
# Установить pytest
pip install pytest pytest-asyncio httpx

# Запустить тесты
pytest tests/

# С coverage
pytest --cov=app tests/
```

---

## 📝 Логирование

### Настройка логов

```python
import logging

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)

logger = logging.getLogger(__name__)
```

### Использование

```python
logger.info(f"User {user.email} logged in")
logger.warning(f"Failed login attempt for {email}")
logger.error(f"Database error: {str(e)}")
```

---

## 🔄 Миграции базы данных

### С Alembic (опционально)

```bash
# Инициализация Alembic
alembic init alembic

# Создать миграцию
alembic revision --autogenerate -m "Add user table"

# Применить миграции
alembic upgrade head

# Откатить миграцию
alembic downgrade -1
```

---

## 🚀 Запуск для разработки

### Локальный запуск

```bash
cd backend
source .venv/bin/activate

# Backend API
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

# Celery Worker
celery -A app.celery_app worker --loglevel=info

# Celery Beat
celery -A app.celery_app beat --loglevel=info
```

### Production запуск

См. systemd сервисы в `/etc/systemd/system/`

---

## 📚 Дополнительная информация

- **FastAPI Docs:** https://fastapi.tiangolo.com/
- **SQLModel Docs:** https://sqlmodel.tiangolo.com/
- **Celery Docs:** https://docs.celeryproject.org/
- **Pydantic Docs:** https://docs.pydantic.dev/

---

**Последнее обновление:** 14 января 2026




