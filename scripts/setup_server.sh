#!/bin/bash

# Скрипт первоначальной настройки сервера Ubuntu
# Использование: sudo ./scripts/setup_server.sh

set -e

log_info() {
    echo -e "\033[0;32m[INFO]\033[0m $1"
}

log_error() {
    echo -e "\033[0;31m[ERROR]\033[0m $1"
}

# Проверка прав root
if [ "$EUID" -ne 0 ]; then 
    log_error "Запустите скрипт с правами root: sudo $0"
    exit 1
fi

log_info "Начало настройки сервера Ubuntu..."

# Обновление системы
log_info "Обновление системы..."
apt update && apt upgrade -y

# Установка базовых инструментов
log_info "Установка базовых инструментов..."
apt install -y git curl wget build-essential

# Установка Python
log_info "Установка Python 3.11..."
apt install -y python3.11 python3.11-venv python3.11-dev python3-pip

# Установка Node.js
log_info "Установка Node.js 18..."
curl -fsSL https://deb.nodesource.com/setup_18.x | bash -
apt install -y nodejs

# Установка PostgreSQL
log_info "Установка PostgreSQL..."
apt install -y postgresql postgresql-contrib

# Установка Nginx
log_info "Установка Nginx..."
apt install -y nginx

# Установка Certbot для SSL
log_info "Установка Certbot..."
apt install -y certbot python3-certbot-nginx

log_info "Настройка сервера завершена!"
log_info "Следующие шаги:"
echo "1. Клонируйте репозиторий: git clone https://github.com/skandini/planner.git /opt/planner"
echo "2. Следуйте инструкциям в DEPLOYMENT.md"

