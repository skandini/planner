# Быстрый запуск бэкенда
Write-Host "=== Запуск бэкенда ===" -ForegroundColor Green
Write-Host ""

cd backend

# Активация виртуального окружения
if (Test-Path .venv\Scripts\Activate.ps1) {
    Write-Host "Активация виртуального окружения..." -ForegroundColor Cyan
    .\.venv\Scripts\Activate.ps1
} else {
    Write-Host "Создание виртуального окружения..." -ForegroundColor Yellow
    python -m venv .venv
    .\.venv\Scripts\Activate.ps1
    Write-Host "Установка зависимостей..." -ForegroundColor Cyan
    pip install -r requirements.txt
}

Write-Host ""
Write-Host "Запуск сервера на http://localhost:8000" -ForegroundColor Green
Write-Host "Документация API: http://localhost:8000/docs" -ForegroundColor Cyan
Write-Host "Нажмите Ctrl+C для остановки" -ForegroundColor Yellow
Write-Host ""

# Запуск сервера
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

