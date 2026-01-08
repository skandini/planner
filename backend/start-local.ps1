# Скрипт для запуска backend локально

Write-Host "=== Настройка Backend ===" -ForegroundColor Green

# Проверка Python
Write-Host "Проверка Python..." -ForegroundColor Yellow
$pythonVersion = python --version 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "ОШИБКА: Python не найден!" -ForegroundColor Red
    exit 1
}
Write-Host "Python найден: $pythonVersion" -ForegroundColor Green

# Создание виртуального окружения
if (-not (Test-Path ".venv")) {
    Write-Host "Создание виртуального окружения..." -ForegroundColor Yellow
    python -m venv .venv
    if ($LASTEXITCODE -ne 0) {
        Write-Host "ОШИБКА: Не удалось создать виртуальное окружение!" -ForegroundColor Red
        exit 1
    }
    Write-Host "Виртуальное окружение создано" -ForegroundColor Green
} else {
    Write-Host "Виртуальное окружение уже существует" -ForegroundColor Green
}

# Активация виртуального окружения
Write-Host "Активация виртуального окружения..." -ForegroundColor Yellow
& .\.venv\Scripts\Activate.ps1

# Обновление pip
Write-Host "Обновление pip..." -ForegroundColor Yellow
python -m pip install --upgrade pip

# Установка зависимостей
Write-Host "Установка зависимостей..." -ForegroundColor Yellow
pip install -r requirements.txt
if ($LASTEXITCODE -ne 0) {
    Write-Host "ОШИБКА: Не удалось установить зависимости!" -ForegroundColor Red
    exit 1
}
Write-Host "Зависимости установлены" -ForegroundColor Green

# Создание .env файла если его нет
if (-not (Test-Path ".env")) {
    Write-Host "Создание .env файла..." -ForegroundColor Yellow
    if (Test-Path "env.example.txt") {
        Copy-Item "env.example.txt" ".env"
        Write-Host ".env файл создан из env.example.txt" -ForegroundColor Green
    } else {
        Write-Host "ПРЕДУПРЕЖДЕНИЕ: env.example.txt не найден, создаю базовый .env" -ForegroundColor Yellow
        "DATABASE_URL=sqlite:///./calendar.db`nSECRET_KEY=changeme-change-in-production" | Out-File -FilePath ".env" -Encoding utf8
    }
} else {
    Write-Host ".env файл уже существует" -ForegroundColor Green
}

# Применение миграций
Write-Host "Применение миграций БД..." -ForegroundColor Yellow
alembic upgrade head
if ($LASTEXITCODE -ne 0) {
    Write-Host "ПРЕДУПРЕЖДЕНИЕ: Проблемы с миграциями, но продолжаем..." -ForegroundColor Yellow
}

Write-Host ""
Write-Host "=== Backend готов к запуску ===" -ForegroundColor Green
Write-Host "Запуск сервера..." -ForegroundColor Yellow
Write-Host "Backend будет доступен на http://localhost:8000" -ForegroundColor Cyan
Write-Host "API документация: http://localhost:8000/docs" -ForegroundColor Cyan
Write-Host ""
Write-Host "Для остановки нажмите Ctrl+C" -ForegroundColor Yellow
Write-Host ""

# Запуск сервера
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

