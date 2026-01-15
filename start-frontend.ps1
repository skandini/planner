# Скрипт для запуска Frontend сервера
Write-Host "Starting Frontend Server..." -ForegroundColor Green

cd frontend

# Проверка зависимостей
if (-not (Test-Path node_modules)) {
    Write-Host "Installing dependencies..." -ForegroundColor Yellow
    npm install
}

# Удаляем кэш .next для чистого запуска (опционально)
# Remove-Item -Recurse -Force .next -ErrorAction SilentlyContinue

# Запуск dev-сервера на порту 3000
Write-Host "Starting Next.js dev server on http://localhost:3000" -ForegroundColor Green
Write-Host "Press Ctrl+C to stop the server" -ForegroundColor Yellow
Write-Host ""

npm run dev
