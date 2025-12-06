# Скрипт для запуска обоих серверов в отдельных окнах PowerShell
Write-Host "Starting Backend and Frontend servers..." -ForegroundColor Green
Write-Host ""

# Запуск Backend в новом окне
Write-Host "Opening Backend server in new window..." -ForegroundColor Cyan
Start-Process powershell -ArgumentList "-NoExit", "-File", "$PSScriptRoot\start-backend.ps1"

# Небольшая задержка
Start-Sleep -Seconds 3

# Запуск Frontend в новом окне
Write-Host "Opening Frontend server in new window..." -ForegroundColor Cyan
Start-Process powershell -ArgumentList "-NoExit", "-File", "$PSScriptRoot\start-frontend.ps1"

Write-Host ""
Write-Host "Both servers are starting in separate windows." -ForegroundColor Green
Write-Host "Backend: http://localhost:8000" -ForegroundColor Cyan
Write-Host "Frontend: http://localhost:3000" -ForegroundColor Cyan
Write-Host ""
Write-Host "Press any key to exit this window (servers will continue running)..." -ForegroundColor Yellow
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")

