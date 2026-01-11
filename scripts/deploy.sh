#!/bin/bash

# Скрипт автоматического развертывания и обновления
# Использование: ./scripts/deploy.sh [update|deploy|rollback]

set -e  # Остановка при ошибке

PROJECT_DIR="/opt/planner"
BACKEND_DIR="$PROJECT_DIR/backend"
FRONTEND_DIR="$PROJECT_DIR/frontend"
BACKUP_DIR="$PROJECT_DIR/backups"

# Цвета для вывода
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Создание резервной копии
backup_database() {
    log_info "Создание резервной копии базы данных..."
    
    mkdir -p "$BACKUP_DIR"
    TIMESTAMP=$(date +%Y%m%d_%H%M%S)
    
    if [ -f "$BACKEND_DIR/calendar.db" ]; then
        cp "$BACKEND_DIR/calendar.db" "$BACKUP_DIR/calendar.db.$TIMESTAMP"
        log_info "Резервная копия создана: $BACKUP_DIR/calendar.db.$TIMESTAMP"
    else
        log_warn "База данных SQLite не найдена, пропускаем резервное копирование"
    fi
}

# Обновление кода из Git
update_code() {
    log_info "Обновление кода из Git..."
    
    cd "$PROJECT_DIR"
    
    # Сохранение текущего коммита
    CURRENT_COMMIT=$(git rev-parse HEAD)
    echo "$CURRENT_COMMIT" > "$BACKUP_DIR/last_commit.txt"
    
    # Получение обновлений
    git fetch origin
    
    # Переключение на нужную ветку (можно изменить)
    BRANCH=${1:-"testmain-copy"}
    git checkout "$BRANCH"
    git pull origin "$BRANCH"
    
    log_info "Код обновлен до коммита: $(git rev-parse HEAD)"
}

# Обновление Backend
update_backend() {
    log_info "Обновление Backend..."
    
    cd "$BACKEND_DIR"
    
    # Активация виртуального окружения
    source .venv/bin/activate
    
    # Обновление зависимостей
    log_info "Обновление Python зависимостей..."
    pip install --upgrade pip
    pip install -r requirements.txt
    
    # Применение миграций
    log_info "Применение миграций базы данных..."
    alembic upgrade head
    
    # Перезапуск сервиса
    log_info "Перезапуск Backend сервиса..."
    sudo systemctl restart planner-backend
    
    # Ожидание запуска
    sleep 3
    
    # Проверка статуса
    if sudo systemctl is-active --quiet planner-backend; then
        log_info "Backend успешно запущен"
    else
        log_error "Backend не запустился! Проверьте логи: sudo journalctl -u planner-backend -n 50"
        exit 1
    fi
}

# Обновление Frontend
update_frontend() {
    log_info "Обновление Frontend..."
    
    cd "$FRONTEND_DIR"
    
    # Обновление зависимостей
    log_info "Обновление Node.js зависимостей..."
    npm install
    
    # Сборка
    log_info "Сборка Frontend..."
    npm run build
    
    # Перезапуск сервиса
    log_info "Перезапуск Frontend сервиса..."
    sudo systemctl restart planner-frontend
    
    # Ожидание запуска
    sleep 3
    
    # Проверка статуса
    if sudo systemctl is-active --quiet planner-frontend; then
        log_info "Frontend успешно запущен"
    else
        log_error "Frontend не запустился! Проверьте логи: sudo journalctl -u planner-frontend -n 50"
        exit 1
    fi
}

# Откат к предыдущей версии
rollback() {
    log_warn "Откат к предыдущей версии..."
    
    cd "$PROJECT_DIR"
    
    # Восстановление коммита
    if [ -f "$BACKUP_DIR/last_commit.txt" ]; then
        LAST_COMMIT=$(cat "$BACKUP_DIR/last_commit.txt")
        log_info "Откат к коммиту: $LAST_COMMIT"
        git checkout "$LAST_COMMIT"
    else
        log_error "Не найден файл с предыдущим коммитом"
        exit 1
    fi
    
    # Восстановление базы данных
    LATEST_BACKUP=$(ls -t "$BACKUP_DIR"/calendar.db.* 2>/dev/null | head -1)
    if [ -n "$LATEST_BACKUP" ]; then
        log_info "Восстановление базы данных из: $LATEST_BACKUP"
        cp "$LATEST_BACKUP" "$BACKEND_DIR/calendar.db"
    fi
    
    # Обновление сервисов
    update_backend
    update_frontend
    
    log_info "Откат выполнен"
}

# Полное развертывание
full_deploy() {
    log_info "Начало полного развертывания..."
    
    backup_database
    update_code
    update_backend
    update_frontend
    
    log_info "Развертывание завершено успешно!"
}

# Обновление существующей установки
update() {
    log_info "Начало обновления..."
    
    backup_database
    update_code "$1"
    update_backend
    update_frontend
    
    log_info "Обновление завершено успешно!"
}

# Главная функция
main() {
    case "${1:-update}" in
        deploy)
            full_deploy
            ;;
        update)
            update "${2:-testmain-copy}"
            ;;
        rollback)
            rollback
            ;;
        *)
            echo "Использование: $0 [deploy|update|rollback] [branch]"
            echo "  deploy   - Полное развертывание"
            echo "  update   - Обновление существующей установки (по умолчанию)"
            echo "  rollback - Откат к предыдущей версии"
            exit 1
            ;;
    esac
}

main "$@"

