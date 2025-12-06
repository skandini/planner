# Инструкция по запуску проекта

## Предварительные требования

- Python 3.8+ установлен
- Node.js 20+ и npm установлены
- PowerShell (для Windows)

## Шаг 1: Запуск Backend (FastAPI)

### 1.1. Настройка виртуального окружения и установка зависимостей

Откройте PowerShell в корневой директории проекта и выполните:

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

### 1.2. Применение миграций базы данных

```powershell
.\.venv\Scripts\alembic upgrade head
```

**Примечание:** Если у вас еще нет личных календарей для существующих пользователей, выполните:

```powershell
python scripts/create_personal_calendars.py
```

### 1.3. Запуск сервера

```powershell
uvicorn app.main:app --reload
```

Backend будет доступен по адресу: `http://localhost:8000`

Проверьте работоспособность: откройте `http://localhost:8000/api/v1/health`

---

## Шаг 2: Запуск Frontend (Next.js)

### 2.1. Установка зависимостей

Откройте **новое окно PowerShell** (backend должен продолжать работать) и выполните:

```powershell
cd frontend
npm install
```

### 2.2. Настройка переменных окружения (опционально)

Если нужно изменить URL API (по умолчанию `http://localhost:8000`), создайте файл `.env.local`:

```powershell
# Если файл не существует, создайте его
echo "NEXT_PUBLIC_API_BASE_URL=http://localhost:8000" > .env.local
```

### 2.3. Запуск dev-сервера

```powershell
npm run dev
```

Frontend будет доступен по адресу: `http://localhost:3000`

---

## Шаг 3: Открытие приложения

Откройте браузер и перейдите на: **http://localhost:3000**

---

## Полезные команды

### Backend

- **Остановка сервера**: Нажмите `Ctrl+C` в терминале с backend
- **Просмотр API документации**: `http://localhost:8000/docs` (Swagger UI)
- **Проверка миграций**: `alembic current` (показывает текущую версию)

### Frontend

- **Остановка сервера**: Нажмите `Ctrl+C` в терминале с frontend
- **Сборка для production**: `npm run build`
- **Запуск production версии**: `npm start`

---

## Решение проблем

### Backend не запускается

1. Проверьте, что виртуальное окружение активировано (должно быть `(.venv)` в начале строки)
2. Убедитесь, что все зависимости установлены: `pip install -r requirements.txt`
3. Проверьте, что порт 8000 свободен

### Frontend не подключается к Backend

1. Убедитесь, что backend запущен на `http://localhost:8000`
2. Проверьте файл `.env.local` в папке `frontend` (если создавали)
3. Проверьте CORS настройки в `backend/app/core/config.py`

### Ошибки базы данных

1. Убедитесь, что миграции применены: `alembic upgrade head`
2. Проверьте файл базы данных `backend/calendar.db` (должен существовать после миграций)

---

## Структура проекта

```
testprj/
├── backend/          # FastAPI backend
│   ├── app/         # Основной код приложения
│   ├── migrations/  # Миграции базы данных
│   └── scripts/     # Вспомогательные скрипты
└── frontend/        # Next.js frontend
    └── src/         # Исходный код
```

---

## Быстрый старт (одной командой)

Если у вас уже настроено окружение, можно запустить оба сервера в отдельных терминалах:

**Терминал 1 (Backend):**
```powershell
cd backend; .\.venv\Scripts\Activate.ps1; uvicorn app.main:app --reload
```

**Терминал 2 (Frontend):**
```powershell
cd frontend; npm run dev
```

