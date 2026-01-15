# 🚀 ШПАРГАЛКА ПО ДЕПЛОЮ

Быстрая справка для ежедневного использования.

---

## 📤 ОТПРАВКА ИЗМЕНЕНИЙ (Локально, Windows)

```powershell
# 1. Проверить что защищено
cd c:\testprj
git status
git check-ignore backend/.env backend/calendar.db CREDENTIALS.md

# 2. Добавить ТОЛЬКО нужные файлы
git add .gitignore
git add frontend/src/components/events/EventModal.tsx
git add <другие_конкретные_файлы>

# 3. Коммит и push
git commit -m "описание изменений"
git push origin refactor/split-page-tsx
```

**⚠️ НИКОГДА:** `git add .` или `git add *`

---

## 🔄 ДЕПЛОЙ НА СЕРВЕР (Ubuntu)

### Автоматический (Рекомендуется)

```bash
ssh root@155.212.190.153
cd /opt/planner
sudo bash scripts/safe-deploy.sh
```

### Ручной

```bash
# 1. Подключиться
ssh root@calendar.corestone.ru

# 2. Бэкап
cd /root/backups
PGPASSWORD='YtragtR65A' pg_dump -U planner_user -d planner_db | gzip > backup_$(date +%Y%m%d_%H%M%S).sql.gz

# 3. Сохранить .env
cd /opt/planner
cp backend/.env backend/.env.backup
cp frontend/.env.local frontend/.env.local.backup

# 4. Pull изменений
git pull origin refactor/split-page-tsx

# 5. ПРОВЕРИТЬ .env (должен быть PostgreSQL!)
cat backend/.env | grep DATABASE_URL

# 6. Backend
cd backend
source .venv/bin/activate
pip install -r requirements.txt
alembic upgrade head

# 7. Frontend
cd ../frontend
npm install
npm run build

# 8. Перезапуск
systemctl restart planner-backend planner-celery-worker planner-frontend
systemctl reload nginx

# 9. Проверка
/usr/local/bin/planner-status.sh
curl http://localhost:8000/api/v1/health
```

---

## ✅ ПРОВЕРКА ПОСЛЕ ДЕПЛОЯ

```bash
# Статус сервисов
systemctl status planner-backend planner-frontend

# Логи
tail -50 /var/log/planner/backend-error.log | grep ERROR

# API
curl https://calendar.corestone.ru/api/v1/health

# Браузер
https://calendar.corestone.ru
```

---

## 🚨 БЫСТРОЕ ВОССТАНОВЛЕНИЕ

```bash
# Откат кода
cd /opt/planner
git log --oneline -5
git reset --hard <предыдущий_коммит>

# Восстановление БД
cd /root/backups
gunzip -c backup_*.sql.gz | PGPASSWORD='YtragtR65A' psql -U planner_user -d planner_db

# Восстановление .env
cd /opt/planner
cp backend/.env.backup backend/.env

# Перезапуск
systemctl restart planner-backend planner-frontend
```

---

## 📋 ЧТО ЗАЩИЩЕНО .gitignore

✅ **НЕ попадет в Git:**
- `backend/.env` (SQLite локально)
- `backend/calendar.db*` (локальная база)
- `backend/uploads/*` (пользовательские файлы)
- `frontend/.env.local`
- `CREDENTIALS.md`
- `.cursor/`

✅ **На сервере останется:**
- PostgreSQL база данных
- Production .env с PostgreSQL
- Redis конфигурация
- Все загруженные файлы пользователей

---

## 💡 ЗОЛОТЫЕ ПРАВИЛА

1. ✅ Всегда делай бэкап перед деплоем
2. ❌ Никогда не используй `git add .`
3. ✅ Проверяй .env после git pull
4. ✅ Тестируй локально перед продакшн
5. ✅ SQLite локально ≠ PostgreSQL на сервере (это ОК!)

---

## 📞 БЫСТРЫЕ КОМАНДЫ

```bash
# Подключение к серверу
ssh root@calendar.corestone.ru

# Статус всех сервисов
/usr/local/bin/planner-status.sh

# Логи в реальном времени
journalctl -u planner-backend -f

# Перезапуск всего
systemctl restart planner-backend planner-celery-worker planner-frontend nginx

# Бэкап БД
PGPASSWORD='YtragtR65A' pg_dump -U planner_user -d planner_db | gzip > /root/backups/backup_$(date +%Y%m%d).sql.gz
```

---

**Полная документация:** См. SAFE_DEPLOY_GUIDE.md

