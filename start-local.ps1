# Скрипт для запуска всего проекта локально

Write-Host "=== Запуск Planner локально ===" -ForegroundColor Cyan
Write-Host ""

# Проверка что мы в корне проекта
if (-not (Test-Path "backend") -or -not (Test-Path "frontend")) {
    Write-Host "ОШИБКА: Запустите скрипт из корня проекта!" -ForegroundColor Red
    exit 1
}

Write-Host "Этот скрипт запустит backend и frontend в отдельных окнах PowerShell" -ForegroundColor Yellow
Write-Host ""
Write-Host "Что будет запущено:" -ForegroundColor Cyan
Write-Host "  1. Backend (FastAPI) на http://localhost:8000" -ForegroundColor White
Write-Host "  2. Frontend (Next.js) на http://localhost:3000" -ForegroundColor White
Write-Host ""
Write-Host "Примечание: Redis и Celery опциональны для локальной разработки" -ForegroundColor Yellow
Write-Host "  - Без Redis: уведомления будут синхронными" -ForegroundColor Gray
Write-Host "  - С Redis: уведомления будут асинхронными через Celery" -ForegroundColor Gray
Write-Host ""

$response = Read-Host "Продолжить? (Y/N)"
if ($response -ne "Y" -and $response -ne "y") {
    Write-Host "Отменено" -ForegroundColor Yellow
    exit 0
}

# Запуск backend в новом окне
Write-Host ""
Write-Host "Запуск Backend..." -ForegroundColor Green
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$PWD\backend'; .\start-local.ps1"

# Небольшая задержка
Start-Sleep -Seconds 3

# Запуск frontend в новом окне
Write-Host "Запуск Frontend..." -ForegroundColor Green
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$PWD\frontend'; .\start-local.ps1"

Write-Host ""
Write-Host "=== Проект запущен! ===" -ForegroundColor Green
Write-Host "Backend: http://localhost:8000" -ForegroundColor Cyan
Write-Host "Frontend: http://localhost:3000" -ForegroundColor Cyan
Write-Host "API Docs: http://localhost:8000/docs" -ForegroundColor Cyan
Write-Host ""
Write-Host "Для остановки закройте окна PowerShell с backend и frontend" -ForegroundColor Yellow

