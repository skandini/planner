# Script to fix locked files issue
# Run this if rebuild fails due to locked files

Write-Host "=== Fixing Locked Files ===" -ForegroundColor Cyan
Write-Host ""

# Stop all Python processes
Write-Host "Stopping Python processes..." -ForegroundColor Yellow
$pythonProcesses = Get-Process -Name "python" -ErrorAction SilentlyContinue
if ($pythonProcesses) {
    Write-Host "Found $($pythonProcesses.Count) Python process(es)" -ForegroundColor Yellow
    $pythonProcesses | Stop-Process -Force
    Start-Sleep -Seconds 2
    Write-Host "Python processes stopped" -ForegroundColor Green
} else {
    Write-Host "No Python processes found" -ForegroundColor Green
}

# Stop all Node.js processes
Write-Host "Stopping Node.js processes..." -ForegroundColor Yellow
$nodeProcesses = Get-Process -Name "node" -ErrorAction SilentlyContinue
if ($nodeProcesses) {
    Write-Host "Found $($nodeProcesses.Count) Node.js process(es)" -ForegroundColor Yellow
    $nodeProcesses | Stop-Process -Force
    Start-Sleep -Seconds 2
    Write-Host "Node.js processes stopped" -ForegroundColor Green
} else {
    Write-Host "No Node.js processes found" -ForegroundColor Green
}

# Stop uvicorn if running
Write-Host "Checking for uvicorn..." -ForegroundColor Yellow
$uvicornProcesses = Get-Process | Where-Object { $_.ProcessName -eq "python" -and $_.CommandLine -like "*uvicorn*" } -ErrorAction SilentlyContinue
if ($uvicornProcesses) {
    $uvicornProcesses | Stop-Process -Force
    Write-Host "Uvicorn stopped" -ForegroundColor Green
}

Write-Host ""
Write-Host "=== Done ===" -ForegroundColor Green
Write-Host "Now you can run: .\rebuild-project.ps1" -ForegroundColor Cyan
Write-Host ""


