# 🚀 БЫСТРЫЙ ДЕПЛОЙ (Шпаргалка)

## 📝 РАБОЧИЙ ПРОЦЕСС

**Локально:** `refactor/split-page-tsx`  
**Прод:** `main`

---

## ✅ ДЕПЛОЙ ИЗМЕНЕНИЙ

### 1. Локально (после разработки)
```powershell
# Коммит изменений
git add <файлы>
git commit -m "описание"
git push origin refactor/split-page-tsx

# Перенос в main
git push origin refactor/split-page-tsx:main
```

### 2. На сервере
```bash
ssh root@calendar.corestone.ru

# Быстрый деплой
cd /opt/planner
git pull origin main
cd frontend && npm run build
systemctl restart planner-frontend planner-backend
```

---

## 🔍 ПРОВЕРКА

```bash
# Статус сервисов
systemctl status planner-backend planner-frontend

# API работает?
curl http://localhost:8000/api/v1/health

# Логи (последние 20 строк)
tail -20 /var/log/planner/backend-error.log

# В браузере
# https://calendar.corestone.ru
```

---

## ⏮️ ОТКАТ (если что-то сломалось)

### Быстрый откат к PROD v1.0
```bash
ssh root@calendar.corestone.ru
cd /opt/planner

# Откат кода
git checkout prod-v1.0

# Пересборка
cd frontend && npm run build

# Перезапуск
systemctl restart planner-backend planner-frontend

# Проверка
curl http://localhost:8000/api/v1/health
```

### Откат к предыдущему коммиту
```bash
cd /opt/planner

# Смотрим историю
git log --oneline -5

# Откат (замените ХХХХ на ID коммита)
git reset --hard ХХХХ

# Пересборка и перезапуск
cd frontend && npm run build
systemctl restart planner-backend planner-frontend
```

---

## 🔥 ЭКСТРЕННЫЙ ОТКАТ (если БД тоже нужна)

```bash
cd /opt/planner
git checkout prod-v1.0

cd /root/backups
ls -lt | head -5  # найти последний бэкап

# Восстановление БД
gunzip -c backup_YYYYMMDD_HHMMSS.sql.gz | PGPASSWORD='YtragtR65A' psql -U planner_user -d planner_db

cd /opt/planner/frontend && npm run build
systemctl restart planner-backend planner-celery-worker planner-frontend
```

---

## 📊 МОНИТОРИНГ

```bash
# Живые логи
journalctl -u planner-backend -f

# Ошибки
grep ERROR /var/log/planner/backend-error.log | tail -20

# Использование ресурсов
htop
```

---

## 💾 БЭКАП ПЕРЕД ДЕПЛОЕМ

```bash
cd /root/backups
PGPASSWORD='YtragtR65A' pg_dump -U planner_user -d planner_db | gzip > backup_$(date +%Y%m%d_%H%M%S).sql.gz
```

---

## 🎯 ТИПИЧНЫЙ ЦИКЛ

```bash
# 1. Локально
git commit -m "feat: новая фича"
git push origin refactor/split-page-tsx:main

# 2. На сервере
ssh root@calendar.corestone.ru
cd /opt/planner
git pull origin main
cd frontend && npm run build
systemctl restart planner-frontend

# 3. Проверка
curl http://localhost:8000/api/v1/health
# Открыть браузер: calendar.corestone.ru

# 4. Если ОК - готово!
# 5. Если НЕ ОК - откат:
git checkout prod-v1.0
cd frontend && npm run build
systemctl restart planner-frontend
```

---

## ⚡ ТОЛЬКО FRONTEND (если бэкенд не менялся)

```bash
cd /opt/planner
git pull origin main
cd frontend
npm run build
systemctl restart planner-frontend
# НЕ перезапускаем backend!
```

---

## 🏷️ СОЗДАНИЕ НОВОЙ PROD ВЕРСИИ

```bash
# Локально (когда всё протестировано)
git tag -a prod-v1.1 -m "PROD v1.1: описание"
git push origin prod-v1.1
git push origin refactor/split-page-tsx:main

# Обновить CHANGELOG.md
```

---

**Сохранено:** `2026-01-15`

