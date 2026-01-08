# Script to check versions and differences between local and production

Write-Host "=== Checking dependency versions ===" -ForegroundColor Cyan
npm list next react react-dom tailwindcss --depth=0

Write-Host "`n=== Checking Node.js and npm ===" -ForegroundColor Cyan
node --version
npm --version

Write-Host "`n=== Checking package.json ===" -ForegroundColor Cyan
if (Test-Path "package.json") {
    $pkg = Get-Content package.json | ConvertFrom-Json
    Write-Host "Next.js: $($pkg.dependencies.next)"
    Write-Host "React: $($pkg.dependencies.react)"
    Write-Host "React-DOM: $($pkg.dependencies.'react-dom')"
} else {
    Write-Host "package.json not found!" -ForegroundColor Red
}

Write-Host "`n=== Checking config files ===" -ForegroundColor Cyan
$files = @("next.config.ts", "tailwind.config.ts", "postcss.config.mjs", "tsconfig.json")
foreach ($file in $files) {
    if (Test-Path $file) {
        Write-Host "[OK] $file exists" -ForegroundColor Green
    } else {
        Write-Host "[ERROR] $file NOT found!" -ForegroundColor Red
    }
}

Write-Host "`n=== Checking build ===" -ForegroundColor Cyan
if (Test-Path ".next") {
    $nextSize = (Get-ChildItem .next -Recurse -ErrorAction SilentlyContinue | 
        Measure-Object -Property Length -Sum).Sum / 1MB
    Write-Host ".next folder exists, size: $([math]::Round($nextSize, 2)) MB" -ForegroundColor Green
    
    if (Test-Path ".next\static\css") {
        $cssFiles = Get-ChildItem ".next\static\css\*.css" -ErrorAction SilentlyContinue
        if ($cssFiles) {
            Write-Host "CSS files found:" -ForegroundColor Green
            $cssFiles | ForEach-Object {
                $sizeKB = [math]::Round($_.Length / 1KB, 2)
                Write-Host "  - $($_.Name): $sizeKB KB"
            }
        } else {
            Write-Host "CSS files NOT found!" -ForegroundColor Red
        }
    } else {
        Write-Host ".next\static\css does not exist!" -ForegroundColor Red
    }
} else {
    Write-Host ".next folder does NOT exist - need to build!" -ForegroundColor Yellow
    Write-Host "Run: npm run build" -ForegroundColor Yellow
}

Write-Host "`n=== Checking source files ===" -ForegroundColor Cyan
$srcFiles = @("src\app\globals.css", "src\app\layout.tsx", "src\app\page.tsx")
foreach ($file in $srcFiles) {
    if (Test-Path $file) {
        $size = (Get-Item $file).Length
        Write-Host "[OK] $file ($size bytes)" -ForegroundColor Green
    } else {
        Write-Host "[ERROR] $file NOT found!" -ForegroundColor Red
    }
}

Write-Host "`n=== Checking environment variables ===" -ForegroundColor Cyan
if (Test-Path ".env.local") {
    Write-Host ".env.local found" -ForegroundColor Green
    $envContent = Get-Content ".env.local" | Where-Object { $_ -match "NEXT_PUBLIC" }
    if ($envContent) {
        Write-Host "NEXT_PUBLIC variables:" -ForegroundColor Green
        $envContent | ForEach-Object { Write-Host "  $_" }
    }
} else {
    Write-Host ".env.local not found" -ForegroundColor Yellow
}

Write-Host "`n=== Recommendations ===" -ForegroundColor Cyan
if (-not (Test-Path ".next")) {
    Write-Host "1. Run: npm run build" -ForegroundColor Yellow
}
if (-not (Test-Path "tailwind.config.ts")) {
    Write-Host "2. Create tailwind.config.ts" -ForegroundColor Yellow
}
if (-not (Test-Path ".env.local")) {
    Write-Host "3. Create .env.local with environment variables" -ForegroundColor Yellow
}

Write-Host "`nCheck completed!" -ForegroundColor Green
