# Скрипт полной пересборки проекта
# Используйте этот скрипт если проект сломан и нужно пересоздать все с нуля

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  ПОЛНАЯ ПЕРЕСБОРКА ПРОЕКТА" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Проверка что мы в корне проекта
if (-not (Test-Path "backend") -or -not (Test-Path "frontend")) {
    Write-Host "ОШИБКА: Запустите скрипт из корня проекта!" -ForegroundColor Red
    exit 1
}

Write-Host "ВНИМАНИЕ: Этот скрипт удалит и пересоздаст:" -ForegroundColor Yellow
Write-Host "  - Backend виртуальное окружение (.venv)" -ForegroundColor Yellow
Write-Host "  - Frontend node_modules" -ForegroundColor Yellow
Write-Host "  - Старые файлы конфигурации (.env, .env.local)" -ForegroundColor Yellow
Write-Host ""
Write-Host "НО: База данных calendar.db НЕ будет удалена!" -ForegroundColor Green
Write-Host ""

$response = Read-Host "Продолжить? (Y/N)"
if ($response -ne "Y" -and $response -ne "y") {
    Write-Host "Отменено" -ForegroundColor Yellow
    exit 0
}

Write-Host ""
Write-Host "=== ШАГ 1: Очистка Backend ===" -ForegroundColor Green

# Остановка процессов если запущены
Write-Host "Проверка запущенных процессов..." -ForegroundColor Yellow
try {
    $pythonProcesses = Get-Process -Name "python" -ErrorAction SilentlyContinue
    if ($pythonProcesses) {
        Write-Host "Найдены процессы Python" -ForegroundColor Yellow
    }
} catch {
    # Игнорируем ошибки при проверке процессов
}

cd backend

# Удаление старого виртуального окружения
if (Test-Path ".venv") {
    Write-Host "Удаление старого виртуального окружения..." -ForegroundColor Yellow
    Remove-Item -Recurse -Force ".venv"
    Write-Host "Виртуальное окружение удалено" -ForegroundColor Green
}

# Удаление старого .env (создадим новый)
if (Test-Path ".env") {
    Write-Host "Удаление старого .env..." -ForegroundColor Yellow
    Remove-Item -Force ".env"
}

# Удаление __pycache__
Write-Host "Очистка __pycache__..." -ForegroundColor Yellow
Get-ChildItem -Path . -Recurse -Filter "__pycache__" -ErrorAction SilentlyContinue | Remove-Item -Recurse -Force -ErrorAction SilentlyContinue
Get-ChildItem -Path . -Recurse -Filter "*.pyc" -ErrorAction SilentlyContinue | Remove-Item -Force -ErrorAction SilentlyContinue
Write-Host "Кэш Python очищен" -ForegroundColor Green

Write-Host ""
Write-Host "=== ШАГ 2: Пересоздание Backend ===" -ForegroundColor Green

# Проверка Python
Write-Host "Проверка Python..." -ForegroundColor Yellow
$pythonVersion = python --version 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "ОШИБКА: Python не найден! Установите Python 3.10+" -ForegroundColor Red
    cd ..
    exit 1
}
Write-Host "Python найден: $pythonVersion" -ForegroundColor Green

# Создание нового виртуального окружения
Write-Host "Создание нового виртуального окружения..." -ForegroundColor Yellow
python -m venv .venv
if ($LASTEXITCODE -ne 0) {
    Write-Host "ОШИБКА: Не удалось создать виртуальное окружение!" -ForegroundColor Red
    cd ..
    exit 1
}
Write-Host "Виртуальное окружение создано" -ForegroundColor Green

# Активация
Write-Host "Активация виртуального окружения..." -ForegroundColor Yellow
& .\.venv\Scripts\Activate.ps1

# Обновление pip
Write-Host "Обновление pip..." -ForegroundColor Yellow
python -m pip install --upgrade pip --quiet

# Установка зависимостей
Write-Host "Установка зависимостей (это может занять несколько минут)..." -ForegroundColor Yellow
pip install -r requirements.txt
if ($LASTEXITCODE -ne 0) {
    Write-Host "ОШИБКА: Не удалось установить зависимости!" -ForegroundColor Red
    cd ..
    exit 1
}
Write-Host "Зависимости установлены" -ForegroundColor Green

# Создание .env
Write-Host "Создание .env файла..." -ForegroundColor Yellow
if (Test-Path "env.example.txt") {
    Copy-Item "env.example.txt" ".env"
    Write-Host ".env файл создан из env.example.txt" -ForegroundColor Green
} else {
    Write-Host "Создание базового .env..." -ForegroundColor Yellow
    $envContent = @"
DATABASE_URL=sqlite:///./calendar.db
SECRET_KEY=changeme-change-in-production
JWT_ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=60
REFRESH_TOKEN_EXPIRE_DAYS=30
BACKEND_CORS_ORIGINS=http://localhost:3000,http://localhost:3001
"@
    $envContent | Out-File -FilePath ".env" -Encoding utf8
    Write-Host ".env файл создан" -ForegroundColor Green
}

# Применение миграций
Write-Host "Применение миграций БД..." -ForegroundColor Yellow
alembic upgrade head
if ($LASTEXITCODE -ne 0) {
    Write-Host "ПРЕДУПРЕЖДЕНИЕ: Проблемы с миграциями" -ForegroundColor Yellow
    Write-Host "Попытка инициализации БД напрямую..." -ForegroundColor Yellow
    python -c "from app.db import init_db; init_db()"
}

cd ..

Write-Host ""
Write-Host "=== ШАГ 3: Очистка Frontend ===" -ForegroundColor Green

cd frontend

# Остановка процессов если запущены
try {
    $nodeProcesses = Get-Process -Name "node" -ErrorAction SilentlyContinue
    if ($nodeProcesses) {
        Write-Host "Найдены процессы Node.js" -ForegroundColor Yellow
    }
} catch {
    # Игнорируем ошибки при проверке процессов
}

# Удаление node_modules
if (Test-Path "node_modules") {
    Write-Host "Удаление node_modules (это может занять время)..." -ForegroundColor Yellow
    Remove-Item -Recurse -Force "node_modules"
    Write-Host "node_modules удален" -ForegroundColor Green
}

# Удаление .next
if (Test-Path ".next") {
    Write-Host "Удаление .next..." -ForegroundColor Yellow
    Remove-Item -Recurse -Force ".next"
}

# Удаление старого .env.local
if (Test-Path ".env.local") {
    Write-Host "Удаление старого .env.local..." -ForegroundColor Yellow
    Remove-Item -Force ".env.local"
}

Write-Host ""
Write-Host "=== ШАГ 4: Пересоздание Frontend ===" -ForegroundColor Green

# Проверка Node.js
Write-Host "Проверка Node.js..." -ForegroundColor Yellow
$nodeVersion = node --version 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "ОШИБКА: Node.js не найден! Установите Node.js 20+" -ForegroundColor Red
    cd ..
    exit 1
}
Write-Host "Node.js найден: $nodeVersion" -ForegroundColor Green

# Проверка npm
Write-Host "Проверка npm..." -ForegroundColor Yellow
$npmVersion = npm --version 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "ОШИБКА: npm не найден!" -ForegroundColor Red
    cd ..
    exit 1
}
Write-Host "npm найден: $npmVersion" -ForegroundColor Green

# Установка зависимостей
Write-Host "Установка зависимостей (это может занять несколько минут)..." -ForegroundColor Yellow
npm install
if ($LASTEXITCODE -ne 0) {
    Write-Host "ОШИБКА: Не удалось установить зависимости!" -ForegroundColor Red
    cd ..
    exit 1
}
Write-Host "Зависимости установлены" -ForegroundColor Green

# Создание .env.local
Write-Host "Создание .env.local файла..." -ForegroundColor Yellow
"NEXT_PUBLIC_API_BASE_URL=http://localhost:8000/api/v1" | Out-File -FilePath ".env.local" -Encoding utf8
Write-Host ".env.local файл создан" -ForegroundColor Green

cd ..

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "  ПЕРЕСБОРКА ЗАВЕРШЕНА УСПЕШНО!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
Write-Host "Что дальше:" -ForegroundColor Cyan
Write-Host "  1. Запустите проект: .\start-local.ps1" -ForegroundColor White
Write-Host "  2. Или запустите отдельно:" -ForegroundColor White
Write-Host "     - Backend:  cd backend; .\start-local.ps1" -ForegroundColor Gray
Write-Host "     - Frontend: cd frontend; .\start-local.ps1" -ForegroundColor Gray
Write-Host ""
Write-Host "Проверка:" -ForegroundColor Cyan
Write-Host "  - Backend:  http://localhost:8000/api/v1/health" -ForegroundColor White
Write-Host "  - Frontend: http://localhost:3000" -ForegroundColor White
Write-Host "  - API Docs: http://localhost:8000/docs" -ForegroundColor White
Write-Host ""

