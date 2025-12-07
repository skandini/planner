# Скрипт для полной пересборки бэкенда
Write-Host "=== Пересборка бэкенда ===" -ForegroundColor Green
Write-Host ""

# Переходим в директорию backend
cd backend

# Проверяем наличие виртуального окружения
if (-not (Test-Path .venv)) {
    Write-Host "Создание виртуального окружения..." -ForegroundColor Yellow
    python -m venv .venv
}

# Активируем виртуальное окружение
Write-Host "Активация виртуального окружения..." -ForegroundColor Cyan
.\.venv\Scripts\Activate.ps1

# Обновляем зависимости
Write-Host "Обновление зависимостей..." -ForegroundColor Cyan
pip install -r requirements.txt --upgrade

# Применяем миграции
Write-Host "Применение миграций базы данных..." -ForegroundColor Cyan
.\.venv\Scripts\alembic upgrade head

# Создаем личные календари для существующих пользователей
Write-Host "Создание личных календарей для пользователей..." -ForegroundColor Cyan
python scripts/create_personal_calendars.py

Write-Host ""
Write-Host "=== Пересборка завершена ===" -ForegroundColor Green
Write-Host ""
Write-Host "Запуск сервера..." -ForegroundColor Cyan
Write-Host "Сервер будет доступен на http://localhost:8000" -ForegroundColor Yellow
Write-Host "Документация API: http://localhost:8000/docs" -ForegroundColor Yellow
Write-Host "Нажмите Ctrl+C для остановки сервера" -ForegroundColor Yellow
Write-Host ""

# Запускаем сервер
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

