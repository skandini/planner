# Инструкция по запуску проекта локально

## Быстрый старт

### Вариант 1: Автоматический запуск (рекомендуется)

```powershell
# Из корня проекта
.\start-local.ps1
```

Этот скрипт автоматически:
- Настроит backend (создаст venv, установит зависимости)
- Настроит frontend (установит зависимости)
- Запустит оба сервера в отдельных окнах

### Вариант 2: Ручной запуск

#### Backend:

```powershell
cd backend
.\start-local.ps1
```

Или вручную:
```powershell
cd backend

# Создать виртуальное окружение (если еще нет)
python -m venv .venv

# Активировать
.\.venv\Scripts\Activate.ps1

# Установить зависимости
pip install -r requirements.txt

# Создать .env (если еще нет)
Copy-Item env.example.txt .env

# Применить миграции
alembic upgrade head

# Запустить сервер
uvicorn app.main:app --reload
```

Backend будет доступен на: http://localhost:8000
API документация: http://localhost:8000/docs

#### Frontend:

```powershell
cd frontend
.\start-local.ps1
```

Или вручную:
```powershell
cd frontend

# Установить зависимости (если еще нет)
npm install

# Создать .env.local (если еще нет)
# NEXT_PUBLIC_API_BASE_URL=http://localhost:8000/api/v1

# Запустить dev сервер
npm run dev
```

Frontend будет доступен на: http://localhost:3000

---

## Что нужно установить заранее:

1. **Python 3.10+**
   - Проверить: `python --version`
   - Скачать: https://www.python.org/downloads/

2. **Node.js 20+**
   - Проверить: `node --version`
   - Скачать: https://nodejs.org/

3. **Redis (опционально)**
   - Для асинхронных уведомлений через Celery
   - Без Redis уведомления будут синхронными (работает, но медленнее)

---

## Настройка Redis (опционально):

### Windows:

**Вариант 1: WSL2 (рекомендуется)**
```bash
# В WSL2
sudo apt update
sudo apt install redis-server
sudo service redis-server start
```

**Вариант 2: Docker**
```bash
docker run -d -p 6379:6379 redis:latest
```

**Вариант 3: Memurai (Windows версия)**
- Скачать: https://www.memurai.com/

### Проверка Redis:
```bash
redis-cli ping
# Должно вернуть: PONG
```

---

## Настройка Celery (опционально):

Если Redis запущен, можно запустить Celery worker:

```powershell
cd backend
.\.venv\Scripts\Activate.ps1

# Запустить worker
celery -A app.celery_app worker --loglevel=info

# В отдельном терминале - запустить beat (периодические задачи)
celery -A app.celery_app beat --loglevel=info
```

---

## Конфигурация:

### Backend (.env):
```env
DATABASE_URL=sqlite:///./calendar.db
SECRET_KEY=changeme-change-in-production
REDIS_URL=redis://localhost:6379/0
CELERY_BROKER_URL=redis://localhost:6379/0
CELERY_RESULT_BACKEND=redis://localhost:6379/0
```

### Frontend (.env.local):
```env
NEXT_PUBLIC_API_BASE_URL=http://localhost:8000/api/v1
```

---

## Проверка что все работает:

1. **Backend:**
   - Откройте: http://localhost:8000/api/v1/health
   - Должно вернуть: `{"status":"ok"}`

2. **Frontend:**
   - Откройте: http://localhost:3000
   - Должна открыться страница входа

3. **API документация:**
   - Откройте: http://localhost:8000/docs
   - Должен открыться Swagger UI

---

## Решение проблем:

### Проблема: "Python не найден"
**Решение:** Установите Python и добавьте в PATH

### Проблема: "Node.js не найден"
**Решение:** Установите Node.js и добавьте в PATH

### Проблема: "Порт 8000 занят"
**Решение:** 
- Остановите другой процесс на порту 8000
- Или измените порт в команде: `uvicorn app.main:app --reload --port 8001`

### Проблема: "Порт 3000 занят"
**Решение:**
- Остановите другой процесс на порту 3000
- Или измените порт: `npm run dev -- -p 3001`

### Проблема: "Ошибка миграций"
**Решение:**
```powershell
cd backend
.\.venv\Scripts\Activate.ps1
alembic upgrade head
```

### Проблема: "Redis connection error"
**Решение:** 
- Это нормально, если Redis не запущен
- Уведомления будут синхронными
- Или запустите Redis (см. выше)

---

## Структура проекта:

```
testprj/
├── backend/          # FastAPI backend
│   ├── app/         # Код приложения
│   ├── migrations/  # Миграции БД
│   ├── .env        # Конфигурация (создается автоматически)
│   └── start-local.ps1
├── frontend/        # Next.js frontend
│   ├── src/        # Код приложения
│   ├── .env.local  # Конфигурация (создается автоматически)
│   └── start-local.ps1
└── start-local.ps1  # Запуск всего проекта
```

---

## Полезные команды:

### Backend:
```powershell
# Создать миграцию
alembic revision --autogenerate -m "описание"

# Применить миграции
alembic upgrade head

# Откатить миграцию
alembic downgrade -1

# Создать пользователя
python scripts/create_user.py
```

### Frontend:
```powershell
# Пересобрать
npm run build

# Проверить типы
npm run type-check

# Линтинг
npm run lint
```

---

## Готово!

После запуска:
- Backend: http://localhost:8000
- Frontend: http://localhost:3000
- API Docs: http://localhost:8000/docs

Для остановки нажмите `Ctrl+C` в окнах с backend и frontend.


