# Скрипт для проверки статуса бэкенда
Write-Host "=== Проверка статуса бэкенда ===" -ForegroundColor Green
Write-Host ""

# Проверка порта 8000
Write-Host "Проверка порта 8000..." -ForegroundColor Cyan
$portCheck = Test-NetConnection -ComputerName localhost -Port 8000 -WarningAction SilentlyContinue
if ($portCheck.TcpTestSucceeded) {
    Write-Host "✓ Порт 8000 доступен" -ForegroundColor Green
} else {
    Write-Host "✗ Порт 8000 недоступен" -ForegroundColor Red
    Write-Host "  Бэкенд не запущен или слушает на другом порту" -ForegroundColor Yellow
}

Write-Host ""

# Проверка health endpoint
Write-Host "Проверка health endpoint..." -ForegroundColor Cyan
try {
    $response = Invoke-WebRequest -Uri "http://localhost:8000/api/v1/health" -UseBasicParsing -TimeoutSec 5
    if ($response.StatusCode -eq 200) {
        Write-Host "✓ Health endpoint отвечает: $($response.Content)" -ForegroundColor Green
    } else {
        Write-Host "✗ Health endpoint вернул статус: $($response.StatusCode)" -ForegroundColor Red
    }
} catch {
    Write-Host "✗ Не удалось подключиться к health endpoint" -ForegroundColor Red
    Write-Host "  Ошибка: $($_.Exception.Message)" -ForegroundColor Yellow
}

Write-Host ""

# Проверка процессов Python
Write-Host "Проверка процессов Python..." -ForegroundColor Cyan
$pythonProcesses = Get-Process | Where-Object {$_.ProcessName -like "*python*"} | Select-Object ProcessName, Id, Path
if ($pythonProcesses) {
    Write-Host "✓ Найдены процессы Python:" -ForegroundColor Green
    $pythonProcesses | ForEach-Object {
        Write-Host "  - $($_.ProcessName) (PID: $($_.Id))" -ForegroundColor Cyan
    }
} else {
    Write-Host "✗ Процессы Python не найдены" -ForegroundColor Red
    Write-Host "  Бэкенд не запущен" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "=== Инструкции ===" -ForegroundColor Green
Write-Host "Если бэкенд не запущен, выполните:" -ForegroundColor Yellow
Write-Host "  cd backend" -ForegroundColor Cyan
Write-Host "  .\.venv\Scripts\Activate.ps1" -ForegroundColor Cyan
Write-Host "  uvicorn app.main:app --reload --host 0.0.0.0 --port 8000" -ForegroundColor Cyan
Write-Host ""

