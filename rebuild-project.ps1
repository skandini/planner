# Rebuild project script
# Full project rebuild - removes and recreates all environments

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  PROJECT REBUILD" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

if (-not (Test-Path "backend") -or -not (Test-Path "frontend")) {
    Write-Host "ERROR: Run script from project root!" -ForegroundColor Red
    exit 1
}

Write-Host "WARNING: This script will delete and recreate:" -ForegroundColor Yellow
Write-Host "  - Backend virtual environment (.venv)" -ForegroundColor Yellow
Write-Host "  - Frontend node_modules" -ForegroundColor Yellow
Write-Host "  - Old config files (.env, .env.local)" -ForegroundColor Yellow
Write-Host ""
Write-Host "NOTE: Database calendar.db will NOT be deleted!" -ForegroundColor Green
Write-Host ""

$response = Read-Host "Continue? (Y/N)"
if ($response -ne "Y" -and $response -ne "y") {
    Write-Host "Cancelled" -ForegroundColor Yellow
    exit 0
}

Write-Host ""
Write-Host "=== STEP 1: Backend Cleanup ===" -ForegroundColor Green

# Stop all Python processes to unlock files
Write-Host "Stopping Python processes..." -ForegroundColor Yellow
try {
    $pythonProcesses = Get-Process -Name "python" -ErrorAction SilentlyContinue
    if ($pythonProcesses) {
        Write-Host "Found $($pythonProcesses.Count) Python process(es), stopping..." -ForegroundColor Yellow
        $pythonProcesses | Stop-Process -Force -ErrorAction SilentlyContinue
        Start-Sleep -Seconds 2
        Write-Host "Python processes stopped" -ForegroundColor Green
    }
} catch {
    Write-Host "Note: Could not check Python processes" -ForegroundColor Yellow
}

cd backend

# Deactivate virtual environment if active
if ($env:VIRTUAL_ENV) {
    Write-Host "Deactivating virtual environment..." -ForegroundColor Yellow
    deactivate
    Start-Sleep -Seconds 1
}

if (Test-Path ".venv") {
    Write-Host "Removing old virtual environment..." -ForegroundColor Yellow
    # Try multiple times if files are locked
    $maxRetries = 3
    $retryCount = 0
    $removed = $false
    while ($retryCount -lt $maxRetries -and -not $removed) {
        try {
            Remove-Item -Recurse -Force ".venv" -ErrorAction Stop
            $removed = $true
            Write-Host "Virtual environment removed" -ForegroundColor Green
        } catch {
            $retryCount++
            if ($retryCount -lt $maxRetries) {
                Write-Host "Files locked, retrying in 2 seconds... (attempt $retryCount/$maxRetries)" -ForegroundColor Yellow
                Start-Sleep -Seconds 2
                # Try to stop Python processes again
                Get-Process -Name "python" -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
            } else {
                Write-Host "WARNING: Could not remove .venv completely. Some files may be locked." -ForegroundColor Yellow
                Write-Host "Please close all Python/PowerShell windows and try again, or restart your computer." -ForegroundColor Yellow
            }
        }
    }
}

if (Test-Path ".env") {
    Write-Host "Removing old .env..." -ForegroundColor Yellow
    Remove-Item -Force ".env"
}

Write-Host "Cleaning __pycache__..." -ForegroundColor Yellow
Get-ChildItem -Path . -Recurse -Filter "__pycache__" -ErrorAction SilentlyContinue | Remove-Item -Recurse -Force -ErrorAction SilentlyContinue
Get-ChildItem -Path . -Recurse -Filter "*.pyc" -ErrorAction SilentlyContinue | Remove-Item -Force -ErrorAction SilentlyContinue
Write-Host "Python cache cleaned" -ForegroundColor Green

Write-Host ""
Write-Host "=== STEP 2: Backend Rebuild ===" -ForegroundColor Green

Write-Host "Checking Python..." -ForegroundColor Yellow
$pythonVersion = python --version 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: Python not found! Install Python 3.10+" -ForegroundColor Red
    cd ..
    exit 1
}
Write-Host "Python found: $pythonVersion" -ForegroundColor Green

Write-Host "Creating virtual environment..." -ForegroundColor Yellow
python -m venv .venv
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: Failed to create virtual environment!" -ForegroundColor Red
    cd ..
    exit 1
}
Write-Host "Virtual environment created" -ForegroundColor Green

Write-Host "Activating virtual environment..." -ForegroundColor Yellow
& .\.venv\Scripts\Activate.ps1

Write-Host "Updating pip..." -ForegroundColor Yellow
python -m pip install --upgrade pip --quiet

Write-Host "Installing dependencies (this may take a few minutes)..." -ForegroundColor Yellow
pip install -r requirements.txt
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: Failed to install dependencies!" -ForegroundColor Red
    cd ..
    exit 1
}
Write-Host "Dependencies installed" -ForegroundColor Green

Write-Host "Creating .env file..." -ForegroundColor Yellow
if (Test-Path "env.example.txt") {
    Copy-Item "env.example.txt" ".env"
    Write-Host ".env file created from env.example.txt" -ForegroundColor Green
} else {
    Write-Host "Creating basic .env..." -ForegroundColor Yellow
    $envContent = "DATABASE_URL=sqlite:///./calendar.db`nSECRET_KEY=changeme-change-in-production`nJWT_ALGORITHM=HS256`nACCESS_TOKEN_EXPIRE_MINUTES=60`nREFRESH_TOKEN_EXPIRE_DAYS=30`nBACKEND_CORS_ORIGINS=http://localhost:3000,http://localhost:3001"
    $envContent | Out-File -FilePath ".env" -Encoding utf8
    Write-Host ".env file created" -ForegroundColor Green
}

Write-Host "Applying database migrations..." -ForegroundColor Yellow
alembic upgrade head
if ($LASTEXITCODE -ne 0) {
    Write-Host "WARNING: Migration issues" -ForegroundColor Yellow
    Write-Host "Trying direct DB initialization..." -ForegroundColor Yellow
    python -c "from app.db import init_db; init_db()"
}

cd ..

Write-Host ""
Write-Host "=== STEP 3: Frontend Cleanup ===" -ForegroundColor Green

# Stop Node.js processes
Write-Host "Stopping Node.js processes..." -ForegroundColor Yellow
try {
    $nodeProcesses = Get-Process -Name "node" -ErrorAction SilentlyContinue
    if ($nodeProcesses) {
        Write-Host "Found $($nodeProcesses.Count) Node.js process(es), stopping..." -ForegroundColor Yellow
        $nodeProcesses | Stop-Process -Force -ErrorAction SilentlyContinue
        Start-Sleep -Seconds 2
        Write-Host "Node.js processes stopped" -ForegroundColor Green
    }
} catch {
    Write-Host "Note: Could not check Node.js processes" -ForegroundColor Yellow
}

cd frontend

if (Test-Path "node_modules") {
    Write-Host "Removing node_modules (this may take time)..." -ForegroundColor Yellow
    # Try multiple times if files are locked
    $maxRetries = 3
    $retryCount = 0
    $removed = $false
    while ($retryCount -lt $maxRetries -and -not $removed) {
        try {
            Remove-Item -Recurse -Force "node_modules" -ErrorAction Stop
            $removed = $true
            Write-Host "node_modules removed" -ForegroundColor Green
        } catch {
            $retryCount++
            if ($retryCount -lt $maxRetries) {
                Write-Host "Files locked, retrying in 2 seconds... (attempt $retryCount/$maxRetries)" -ForegroundColor Yellow
                Start-Sleep -Seconds 2
                Get-Process -Name "node" -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
            } else {
                Write-Host "WARNING: Could not remove node_modules completely. Some files may be locked." -ForegroundColor Yellow
            }
        }
    }
}

if (Test-Path ".next") {
    Write-Host "Removing .next..." -ForegroundColor Yellow
    Remove-Item -Recurse -Force ".next"
}

if (Test-Path ".env.local") {
    Write-Host "Removing old .env.local..." -ForegroundColor Yellow
    Remove-Item -Force ".env.local"
}

Write-Host ""
Write-Host "=== STEP 4: Frontend Rebuild ===" -ForegroundColor Green

Write-Host "Checking Node.js..." -ForegroundColor Yellow
$nodeVersion = node --version 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: Node.js not found! Install Node.js 20+" -ForegroundColor Red
    cd ..
    exit 1
}
Write-Host "Node.js found: $nodeVersion" -ForegroundColor Green

Write-Host "Checking npm..." -ForegroundColor Yellow
$npmVersion = npm --version 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: npm not found!" -ForegroundColor Red
    cd ..
    exit 1
}
Write-Host "npm found: $npmVersion" -ForegroundColor Green

Write-Host "Installing dependencies (this may take a few minutes)..." -ForegroundColor Yellow
npm install
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: Failed to install dependencies!" -ForegroundColor Red
    cd ..
    exit 1
}
Write-Host "Dependencies installed" -ForegroundColor Green

Write-Host "Creating .env.local file..." -ForegroundColor Yellow
"NEXT_PUBLIC_API_BASE_URL=http://localhost:8000/api/v1" | Out-File -FilePath ".env.local" -Encoding utf8
Write-Host ".env.local file created" -ForegroundColor Green

cd ..

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "  REBUILD COMPLETED SUCCESSFULLY!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Cyan
Write-Host "  1. Start project: .\start-local.ps1" -ForegroundColor White
Write-Host "  2. Or start separately:" -ForegroundColor White
Write-Host "     - Backend:  cd backend; .\start-local.ps1" -ForegroundColor Gray
Write-Host "     - Frontend: cd frontend; .\start-local.ps1" -ForegroundColor Gray
Write-Host ""
Write-Host "Check:" -ForegroundColor Cyan
Write-Host "  - Backend:  http://localhost:8000/api/v1/health" -ForegroundColor White
Write-Host "  - Frontend: http://localhost:3000" -ForegroundColor White
Write-Host "  - API Docs: http://localhost:8000/docs" -ForegroundColor White
Write-Host ""
