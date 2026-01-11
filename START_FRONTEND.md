# Запуск фронтенда на продакшене

## Проверка: Запущен ли фронтенд?

```bash
# 1. Проверить, есть ли systemd сервис для фронтенда
sudo systemctl status planner-frontend

# 2. Или проверить через PM2
pm2 list

# 3. Проверить, слушается ли порт 3000
sudo ss -tlnp | grep :3000
# или
sudo netstat -tlnp | grep :3000
```

## Запуск фронтенда

### Вариант 1: Если есть systemd сервис

```bash
# Проверить статус
sudo systemctl status planner-frontend

# Если не запущен, запустить
sudo systemctl start planner-frontend

# Или перезапустить
sudo systemctl restart planner-frontend

# Проверить логи
sudo journalctl -u planner-frontend -f --lines 50
```

### Вариант 2: Через PM2 (рекомендуется для Node.js)

```bash
cd /opt/planner/frontend

# Проверить, есть ли процессы PM2
pm2 list

# Если есть процесс planner-frontend, перезапустить
pm2 restart planner-frontend

# Если нет, запустить
npm run build
pm2 start npm --name "planner-frontend" -- start
pm2 save
pm2 list
```

### Вариант 3: Запуск вручную (для теста)

```bash
cd /opt/planner/frontend

# Установить зависимости (если нужно)
npm install

# Собрать production версию
npm run build

# Запустить сервер
npm start

# Или запустить в фоне
nohup npm start > /tmp/frontend.log 2>&1 &
```

## Проверка работы

```bash
# Проверить, что порт 3000 слушается
sudo ss -tlnp | grep :3000

# Проверить через браузер или wget/curl
# (если установлен wget)
wget -qO- http://localhost:3000 | head -20

# Или через браузер открыть:
# http://your-server-ip:3000
```

## Полная проверка системы

```bash
# 1. Бэкенд (порт 8000)
sudo systemctl status planner-backend
sudo ss -tlnp | grep :8000

# 2. Фронтенд (порт 3000)
sudo systemctl status planner-frontend
# или
pm2 list
sudo ss -tlnp | grep :3000

# 3. Логи бэкенда (проверить на ошибки)
sudo journalctl -u planner-backend -n 50 --no-pager

# 4. Логи фронтенда
sudo journalctl -u planner-frontend -n 50 --no-pager
# или
pm2 logs planner-frontend --lines 50
```

