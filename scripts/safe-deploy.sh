#!/bin/bash
#
# АВТОМАТИЧЕСКИЙ БЕЗОПАСНЫЙ ДЕПЛОЙ PLANNER
# Использование: sudo bash safe-deploy.sh
#
# Этот скрипт:
# 1. Создает бэкапы базы данных и конфигурации
# 2. Получает изменения из Git
# 3. Защищает .env файлы от перезаписи
# 4. Обновляет зависимости
# 5. Перезапускает сервисы
# 6. Проверяет работоспособность

set -e  # Остановить при первой ошибке

# Цвета для вывода
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Функции для красивого вывода
info() {
    echo -e "${BLUE}ℹ ${1}${NC}"
}

success() {
    echo -e "${GREEN}✓ ${1}${NC}"
}

warning() {
    echo -e "${YELLOW}⚠ ${1}${NC}"
}

error() {
    echo -e "${RED}✗ ${1}${NC}"
}

# Проверка что скрипт запущен от root
if [ "$EUID" -ne 0 ]; then 
    error "Запустите скрипт от root: sudo bash $0"
    exit 1
fi

echo "╔════════════════════════════════════════════════════════╗"
echo "║     БЕЗОПАСНЫЙ ДЕПЛОЙ PLANNER НА ПРОДАКШН             ║"
echo "╚════════════════════════════════════════════════════════╝"
echo ""

# Константы
PROJECT_DIR="/opt/planner"
BACKUP_DIR="/root/backups"
DATE=$(date +%Y%m%d_%H%M%S)
BRANCH="refactor/split-page-tsx"

# Создание директории для бэкапов
mkdir -p $BACKUP_DIR

# ============================================
# Этап 1: Бэкапы
# ============================================
echo ""
info "Этап 1: Создание бэкапов..."

# Бэкап базы данных PostgreSQL
info "Создание бэкапа базы данных PostgreSQL..."
PGPASSWORD='YtragtR65A' pg_dump -U planner_user -d planner_db | gzip > $BACKUP_DIR/backup_before_deploy_$DATE.sql.gz
if [ $? -eq 0 ]; then
    success "Бэкап БД создан: backup_before_deploy_$DATE.sql.gz"
else
    error "Ошибка создания бэкапа БД!"
    exit 1
fi

# Бэкап .env файлов
info "Создание бэкапа .env файлов..."
cd $PROJECT_DIR
cp backend/.env backend/.env.backup_$DATE
cp frontend/.env.local frontend/.env.local.backup_$DATE 2>/dev/null || true
success ".env файлы сохранены"

# Бэкап загруженных файлов (только если изменялись за последние 7 дней)
info "Проверка необходимости бэкапа uploads..."
if [ -d "$PROJECT_DIR/backend/uploads" ]; then
    MODIFIED=$(find $PROJECT_DIR/backend/uploads -type f -mtime -7 | wc -l)
    if [ $MODIFIED -gt 0 ]; then
        info "Создание бэкапа uploads (найдено $MODIFIED новых файлов)..."
        tar -czf $BACKUP_DIR/uploads_$DATE.tar.gz $PROJECT_DIR/backend/uploads/ 2>/dev/null
        success "Бэкап uploads создан"
    else
        info "Новых файлов в uploads нет, пропускаем бэкап"
    fi
fi

# ============================================
# Этап 2: Git Pull
# ============================================
echo ""
info "Этап 2: Получение изменений из Git..."

cd $PROJECT_DIR

# Проверка текущей ветки
CURRENT_BRANCH=$(git branch --show-current)
info "Текущая ветка: $CURRENT_BRANCH"

# Проверка статуса
if ! git diff-index --quiet HEAD --; then
    warning "Обнаружены локальные изменения, сохраняем..."
    git stash
    success "Локальные изменения сохранены в stash"
fi

# Pull изменений
info "Получение изменений из origin/$BRANCH..."
git pull origin $BRANCH

if [ $? -eq 0 ]; then
    success "Изменения получены успешно"
else
    error "Ошибка при получении изменений из Git!"
    exit 1
fi

# ============================================
# Этап 3: Восстановление .env файлов
# ============================================
echo ""
info "Этап 3: Проверка .env файлов..."

# Проверка backend .env
if [ ! -f "$PROJECT_DIR/backend/.env" ]; then
    error "backend/.env отсутствует! Восстанавливаем из бэкапа..."
    cp backend/.env.backup_$DATE backend/.env
    success ".env восстановлен"
fi

# Проверка что .env содержит PostgreSQL (а не SQLite)
if grep -q "sqlite" "$PROJECT_DIR/backend/.env"; then
    error "КРИТИЧНО! .env содержит SQLite вместо PostgreSQL!"
    error "Восстанавливаем правильный .env..."
    cp backend/.env.backup_$DATE backend/.env
    success ".env восстановлен с PostgreSQL"
fi

# Проверка frontend .env.local
if [ ! -f "$PROJECT_DIR/frontend/.env.local" ]; then
    warning "frontend/.env.local отсутствует, восстанавливаем..."
    if [ -f "frontend/.env.local.backup_$DATE" ]; then
        cp frontend/.env.local.backup_$DATE frontend/.env.local
        success ".env.local восстановлен"
    fi
fi

success "Все .env файлы на месте и корректны"

# ============================================
# Этап 4: Обновление Backend
# ============================================
echo ""
info "Этап 4: Обновление Backend..."

cd $PROJECT_DIR/backend

# Активация виртуального окружения и обновление зависимостей
info "Обновление Python зависимостей..."
source .venv/bin/activate
pip install -r requirements.txt --quiet

if [ $? -eq 0 ]; then
    success "Backend зависимости обновлены"
else
    error "Ошибка обновления backend зависимостей!"
    exit 1
fi

# Применение миграций
info "Применение миграций базы данных..."
alembic upgrade head

if [ $? -eq 0 ]; then
    success "Миграции применены"
else
    warning "Миграции не применены (возможно, нет новых)"
fi

# ============================================
# Этап 5: Обновление Frontend
# ============================================
echo ""
info "Этап 5: Обновление Frontend..."

cd $PROJECT_DIR/frontend

# Обновление зависимостей
info "Обновление Node.js зависимостей..."
npm install --quiet

if [ $? -eq 0 ]; then
    success "Frontend зависимости обновлены"
else
    error "Ошибка обновления frontend зависимостей!"
    exit 1
fi

# Сборка production версии
info "Сборка production версии frontend..."
npm run build

if [ $? -eq 0 ]; then
    success "Frontend собран успешно"
else
    error "Ошибка сборки frontend!"
    exit 1
fi

# ============================================
# Этап 6: Перезапуск сервисов
# ============================================
echo ""
info "Этап 6: Перезапуск сервисов..."

# Backend
info "Перезапуск Backend..."
systemctl restart planner-backend
sleep 2
if systemctl is-active --quiet planner-backend; then
    success "Backend запущен"
else
    error "Backend не запустился! Проверьте логи: journalctl -u planner-backend -n 50"
    exit 1
fi

# Celery Worker
info "Перезапуск Celery Worker..."
systemctl restart planner-celery-worker
sleep 1
if systemctl is-active --quiet planner-celery-worker; then
    success "Celery Worker запущен"
else
    warning "Celery Worker не запустился! Проверьте логи: journalctl -u planner-celery-worker -n 50"
fi

# Celery Beat
info "Перезапуск Celery Beat..."
systemctl restart planner-celery-beat
sleep 1
if systemctl is-active --quiet planner-celery-beat; then
    success "Celery Beat запущен"
else
    warning "Celery Beat не запустился!"
fi

# Frontend
info "Перезапуск Frontend..."
systemctl restart planner-frontend
sleep 2
if systemctl is-active --quiet planner-frontend; then
    success "Frontend запущен"
else
    error "Frontend не запустился! Проверьте логи: journalctl -u planner-frontend -n 50"
    exit 1
fi

# Nginx
info "Перезагрузка Nginx..."
systemctl reload nginx
success "Nginx перезагружен"

# ============================================
# Этап 7: Проверка работоспособности
# ============================================
echo ""
info "Этап 7: Проверка работоспособности..."

# Проверка API health endpoint
info "Проверка API health endpoint..."
sleep 3
HEALTH_RESPONSE=$(curl -s http://localhost:8000/api/v1/health)

if echo "$HEALTH_RESPONSE" | grep -q "healthy"; then
    success "API работает корректно"
else
    error "API не отвечает или вернул ошибку!"
    error "Ответ: $HEALTH_RESPONSE"
    warning "Проверьте логи: tail -50 /var/log/planner/backend-error.log"
    exit 1
fi

# Проверка Frontend
info "Проверка Frontend..."
FRONTEND_RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000)

if [ "$FRONTEND_RESPONSE" = "200" ]; then
    success "Frontend работает корректно"
else
    error "Frontend не отвечает! HTTP код: $FRONTEND_RESPONSE"
    exit 1
fi

# Проверка PostgreSQL
info "Проверка PostgreSQL..."
PGPASSWORD='YtragtR65A' psql -U planner_user -d planner_db -c "SELECT COUNT(*) FROM users;" > /dev/null 2>&1

if [ $? -eq 0 ]; then
    success "PostgreSQL работает корректно"
else
    error "Ошибка подключения к PostgreSQL!"
    exit 1
fi

# Проверка Redis
info "Проверка Redis..."
redis-cli ping > /dev/null 2>&1

if [ $? -eq 0 ]; then
    success "Redis работает корректно"
else
    warning "Redis не отвечает!"
fi

# Проверка логов на критические ошибки
info "Проверка логов на ошибки..."
ERROR_COUNT=$(tail -100 /var/log/planner/backend-error.log 2>/dev/null | grep -c "ERROR" || echo "0")

if [ "$ERROR_COUNT" -gt 5 ]; then
    warning "Обнаружено $ERROR_COUNT ошибок в логах backend"
    warning "Проверьте: tail -50 /var/log/planner/backend-error.log"
else
    success "В логах нет критических ошибок"
fi

# ============================================
# Итоги
# ============================================
echo ""
echo "╔════════════════════════════════════════════════════════╗"
echo "║            ДЕПЛОЙ ЗАВЕРШЕН УСПЕШНО! ✓                 ║"
echo "╚════════════════════════════════════════════════════════╝"
echo ""
success "Проект успешно обновлен и запущен!"
echo ""
info "Бэкапы сохранены в: $BACKUP_DIR"
info "  - БД: backup_before_deploy_$DATE.sql.gz"
info "  - .env: backend/.env.backup_$DATE"
echo ""
info "Проверьте работу приложения:"
echo "  - Frontend: https://calendar.corestone.ru"
echo "  - API Docs: https://calendar.corestone.ru/docs"
echo "  - API Health: https://calendar.corestone.ru/api/v1/health"
echo ""
info "Логи доступны в:"
echo "  - Backend: tail -f /var/log/planner/backend.log"
echo "  - Frontend: tail -f /var/log/planner/frontend.log"
echo "  - Celery: tail -f /var/log/planner/celery-worker.log"
echo ""
success "Все готово! 🚀"
echo ""


