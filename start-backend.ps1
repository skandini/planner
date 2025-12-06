# Скрипт для запуска Backend сервера
Write-Host "Starting Backend Server..." -ForegroundColor Green

cd backend

# Активация виртуального окружения
if (Test-Path .venv\Scripts\Activate.ps1) {
    .\.venv\Scripts\Activate.ps1
    Write-Host "Virtual environment activated" -ForegroundColor Cyan
} else {
    Write-Host "Virtual environment not found. Creating..." -ForegroundColor Yellow
    python -m venv .venv
    .\.venv\Scripts\Activate.ps1
    pip install -r requirements.txt
}

# Проверка миграций
Write-Host "Checking database migrations..." -ForegroundColor Cyan
.\.venv\Scripts\alembic upgrade head

# Запуск сервера
Write-Host "Starting FastAPI server on http://localhost:8000" -ForegroundColor Green
Write-Host "API docs available at http://localhost:8000/docs" -ForegroundColor Cyan
Write-Host "Press Ctrl+C to stop the server" -ForegroundColor Yellow
Write-Host ""

uvicorn app.main:app --reload

