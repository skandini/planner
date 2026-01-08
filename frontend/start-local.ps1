# Скрипт для запуска frontend локально

Write-Host "=== Настройка Frontend ===" -ForegroundColor Green

# Проверка Node.js
Write-Host "Проверка Node.js..." -ForegroundColor Yellow
$nodeVersion = node --version 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "ОШИБКА: Node.js не найден!" -ForegroundColor Red
    exit 1
}
Write-Host "Node.js найден: $nodeVersion" -ForegroundColor Green

# Проверка npm
Write-Host "Проверка npm..." -ForegroundColor Yellow
$npmVersion = npm --version 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "ОШИБКА: npm не найден!" -ForegroundColor Red
    exit 1
}
Write-Host "npm найден: $npmVersion" -ForegroundColor Green

# Установка зависимостей если нужно
if (-not (Test-Path "node_modules")) {
    Write-Host "Установка зависимостей..." -ForegroundColor Yellow
    npm install
    if ($LASTEXITCODE -ne 0) {
        Write-Host "ОШИБКА: Не удалось установить зависимости!" -ForegroundColor Red
        exit 1
    }
    Write-Host "Зависимости установлены" -ForegroundColor Green
} else {
    Write-Host "Зависимости уже установлены" -ForegroundColor Green
}

# Проверка .env.local
if (-not (Test-Path ".env.local")) {
    Write-Host "Создание .env.local файла..." -ForegroundColor Yellow
    $envContent = "NEXT_PUBLIC_API_BASE_URL=http://localhost:8000/api/v1"
    $envContent | Out-File -FilePath ".env.local" -Encoding utf8
    Write-Host ".env.local файл создан" -ForegroundColor Green
} else {
    Write-Host ".env.local файл уже существует" -ForegroundColor Green
}

Write-Host ""
Write-Host "=== Frontend готов к запуску ===" -ForegroundColor Green
Write-Host "Запуск dev сервера..." -ForegroundColor Yellow
Write-Host "Frontend будет доступен на http://localhost:3000" -ForegroundColor Cyan
Write-Host ""
Write-Host "Для остановки нажмите Ctrl+C" -ForegroundColor Yellow
Write-Host ""

# Запуск dev сервера
npm run dev

