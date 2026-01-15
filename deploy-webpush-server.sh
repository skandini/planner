#!/bin/bash
# Скрипт для деплоя Web Push Notifications на сервере
# Выполнять на сервере: bash deploy-webpush-server.sh

set -e  # Остановка при ошибке

echo "🚀 Деплой Web Push Notifications..."
echo ""

# 1. Переходим в директорию проекта
cd /opt/planner

# 2. Пуллим изменения
echo "📥 Загрузка изменений из GitHub..."
git pull origin main

# 3. Backend: установка зависимостей
echo ""
echo "📦 Установка Python зависимостей..."
cd backend
source .venv/bin/activate
pip install pywebpush py-vapid

# 4. Проверка VAPID ключей
echo ""
echo "🔑 Проверка VAPID ключей..."
if grep -q "VAPID_PUBLIC_KEY" .env; then
    echo "✅ VAPID ключи уже добавлены в .env"
else
    echo "❌ VAPID ключи НЕ НАЙДЕНЫ в .env!"
    echo ""
    echo "ВАЖНО! Добавьте эти строки в /opt/planner/backend/.env:"
    echo ""
    echo "VAPID_PRIVATE_KEY=-----BEGIN PRIVATE KEY-----"
    echo "MIGHAgEAMBMGByqGSM49AgEGCCqGSM49AwEHBG0wawIBAQQgaiCSPtNvbV3QFSi2"
    echo "Bl9ySdN7Jf5XYu4moRAiIHD9jjGhRANCAASWVRP5D+x7kNVA5jYw7vLNyb+5JTCs"
    echo "61UpJYFjf+np5QFOZgqrXia4Z42sMLgpPMI5ERB21lgazVXnDS3g7olC"
    echo "-----END PRIVATE KEY-----"
    echo "VAPID_PUBLIC_KEY=BJZVE_kP7HuQ1UDmNjDu8s3Jv7klMKzrVSklgWN_6enlAU5mCqteJrhnjawwuCk8wjkREHbWWBrNVecNLeDuiUI"
    echo "VAPID_CLAIMS_EMAIL=mailto:admin@corestone.ru"
    echo ""
    echo "Команда: nano /opt/planner/backend/.env"
    echo ""
    read -p "Добавили ключи? (y/n) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "❌ Деплой прерван. Добавьте VAPID ключи и запустите снова."
        exit 1
    fi
fi

# 5. Миграция БД
echo ""
echo "🗄️  Создание миграции БД..."
alembic revision --autogenerate -m "add_push_subscriptions_table" || echo "⚠️  Миграция уже существует или ошибка"
echo ""
echo "🗄️  Применение миграций..."
alembic upgrade head

# 6. Frontend: пересборка
echo ""
echo "🎨 Пересборка Frontend..."
cd ../frontend
npm install
npm run build

# 7. Перезапуск сервисов
echo ""
echo "🔄 Перезапуск сервисов..."
systemctl restart planner-backend
systemctl restart planner-celery-worker
systemctl restart planner-frontend

# 8. Проверка статуса
echo ""
echo "✅ Проверка статуса сервисов..."
systemctl status planner-backend --no-pager -l | head -5
systemctl status planner-celery-worker --no-pager -l | head -5
systemctl status planner-frontend --no-pager -l | head -5

echo ""
echo "🎉 ДЕПЛОЙ ЗАВЕРШЕН!"
echo ""
echo "📋 Проверьте работу:"
echo "1. Откройте https://calendar.corestone.ru"
echo "2. Профиль → вкладка '🔔 Уведомления'"
echo "3. Нажмите 'Включить' → Разрешите уведомления"
echo "4. Попросите коллегу создать событие"
echo "5. Закройте браузер → Уведомление должно прийти!"
echo ""

