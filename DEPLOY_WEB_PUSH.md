# 🚀 Быстрый деплой Web Push Notifications

## 📋 ЧТО НУЖНО СДЕЛАТЬ

### 1. Пуш в main (локально)

```bash
git push origin refactor/split-page-tsx:main
```

### 2. Деплой на сервер

```bash
ssh root@155.212.190.153
cd /opt/planner
git pull origin main

# Backend
cd backend
source .venv/bin/activate
pip install pywebpush py-vapid
```

### 3. Добавить VAPID ключи в .env

```bash
nano /opt/planner/backend/.env
```

Добавьте эти строки:

```env
# Web Push Notifications
VAPID_PRIVATE_KEY=-----BEGIN PRIVATE KEY-----
MIGHAgEAMBMGByqGSM49AgEGCCqGSM49AwEHBG0wawIBAQQgaiCSPtNvbV3QFSi2
Bl9ySdN7Jf5XYu4moRAiIHD9jjGhRANCAASWVRP5D+x7kNVA5jYw7vLNyb+5JTCs
61UpJYFjf+np5QFOZgqrXia4Z42sMLgpPMI5ERB21lgazVXnDS3g7olC
-----END PRIVATE KEY-----
VAPID_PUBLIC_KEY=BJZVE_kP7HuQ1UDmNjDu8s3Jv7klMKzrVSklgWN_6enlAU5mCqteJrhnjawwuCk8wjkREHbWWBrNVecNLeDuiUI
VAPID_CLAIMS_EMAIL=mailto:admin@corestone.ru
```

### 4. Создать миграцию БД

```bash
cd /opt/planner/backend
source .venv/bin/activate
alembic revision --autogenerate -m "add_push_subscriptions_table"
alembic upgrade head
```

### 5. Пересобрать Frontend

```bash
cd /opt/planner/frontend
npm install
npm run build
```

### 6. Перезапустить сервисы

```bash
systemctl restart planner-backend planner-celery-worker planner-frontend
systemctl status planner-backend planner-celery-worker planner-frontend
```

---

## ✅ ПРОВЕРКА

1. Откройте https://calendar.corestone.ru
2. Профиль → вкладка "🔔 Уведомления"
3. Нажмите "Включить" → Разрешите уведомления
4. Попросите коллегу создать событие и пригласить вас
5. **Закройте браузер** → Уведомление должно прийти! 🎉

---

## 🐛 Если что-то не работает

Смотрите подробную инструкцию: `WEB_PUSH_SETUP.md`

