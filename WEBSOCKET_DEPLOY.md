# 🔌 Деплой WebSocket + Redis Pub/Sub

## ❗ ПРОБЛЕМА

WebSocket соединения падают с ошибкой 1006 - **Nginx не настроен для проксирования WebSocket**.

---

## ✅ РЕШЕНИЕ: Настройка Nginx для WebSocket

### 1. На сервере: Обновить конфигурацию Nginx

```bash
ssh root@calendar.corestone.ru

# Отредактировать конфигурацию Nginx
nano /etc/nginx/sites-available/planner
```

### 2. Добавить WebSocket location

Добавьте **ПЕРЕД** блоком `location /api/` следующий блок для WebSocket:

```nginx
# WebSocket support для real-time notifications
location /api/v1/ws/ {
    proxy_pass http://127.0.0.1:8000;
    
    # WebSocket специфичные заголовки
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    
    # Стандартные заголовки
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    
    # Таймауты для длительных соединений
    proxy_read_timeout 3600s;
    proxy_send_timeout 3600s;
    
    # Отключить буферизацию для real-time
    proxy_buffering off;
}

# Остальные API endpoints
location /api/ {
    proxy_pass http://127.0.0.1:8000;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```

### 3. Проверить и применить конфигурацию

```bash
# Проверить синтаксис
nginx -t

# Если OK - перезагрузить Nginx
systemctl reload nginx
```

---

## 🔍 ПРОВЕРКА КОНФИГУРАЦИИ

### Текущая конфигурация Nginx

```bash
# Посмотреть текущую конфигурацию
cat /etc/nginx/sites-available/planner
```

### Проверка WebSocket подключения

```bash
# 1. Проверить что backend работает
systemctl status planner-backend

# 2. Проверить логи backend
journalctl -u planner-backend -n 50

# 3. Проверить Redis (нужен для Pub/Sub)
redis-cli ping
redis-cli info | grep pubsub

# 4. Проверить что порт 8000 слушает WebSocket
curl -i -N -H "Connection: Upgrade" \
  -H "Upgrade: websocket" \
  -H "Host: localhost:8000" \
  http://localhost:8000/api/v1/ws/notifications
```

---

## 🔄 ПОЛНЫЙ ДЕПЛОЙ (после настройки Nginx)

```bash
ssh root@calendar.corestone.ru
cd /opt/planner

# 1. Pull изменений (уже сделано)
git pull origin main

# 2. Установить зависимости Python (websockets)
cd backend
source .venv/bin/activate
pip install websockets python-multipart
deactivate

# 3. Пересобрать frontend (уже сделано)
cd ../frontend
npm run build

# 4. Перезапустить сервисы
systemctl restart planner-backend
systemctl restart planner-celery-worker
systemctl restart planner-frontend

# 5. Применить конфигурацию Nginx (ПОСЛЕ редактирования!)
nginx -t && systemctl reload nginx

# 6. Проверка
sleep 3
systemctl status planner-backend
journalctl -u planner-backend -n 20
```

---

## 🧪 ТЕСТИРОВАНИЕ В БРАУЗЕРЕ

После деплоя откройте консоль браузера на `calendar.corestone.ru`:

### Успешное подключение:
```
[WebSocket] Connecting to: wss://calendar.corestone.ru/api/v1/ws/notifications?token=...
[WebSocket] Connected successfully
[Notifications] WebSocket connected - real-time updates enabled
```

### Если ошибка:
```
WebSocket connection to 'wss://...' failed: 
[WebSocket] Error: Event
[WebSocket] Disconnected: 1006
```
→ **Значит Nginx всё ещё не настроен для WebSocket!**

---

## 📋 ТРЕБОВАНИЯ

### Backend зависимости (уже в requirements.txt):
- ✅ `fastapi[websockets]` - WebSocket support
- ✅ `redis>=5.0.0` - Pub/Sub
- ✅ `aioredis` - Async Redis client

### Сервисы:
- ✅ Redis - должен работать
- ✅ planner-backend - должен перезапуститься
- ⚠️ Nginx - требует ручной настройки!

---

## 🚨 TROUBLESHOOTING

### WebSocket всё ещё не работает?

```bash
# 1. Проверить что Nginx имеет WebSocket блок
grep -A 10 "location /api/v1/ws/" /etc/nginx/sites-available/planner

# Если пусто - значит не добавили WebSocket location!

# 2. Проверить логи Nginx
tail -50 /var/log/nginx/planner-error.log

# 3. Проверить логи backend
journalctl -u planner-backend -n 100 | grep -i websocket

# 4. Проверить что Redis работает
systemctl status redis-server
redis-cli ping

# 5. Попробовать подключиться напрямую к backend (минуя Nginx)
# В браузере консоль:
# new WebSocket('ws://calendar.corestone.ru:8000/api/v1/ws/notifications?token=YOUR_TOKEN')
# Если работает - проблема в Nginx!
```

### 503 Service Temporarily Unavailable?

```bash
# Скорее всего backend упал
systemctl status planner-backend
journalctl -u planner-backend -n 50

# Перезапустить
systemctl restart planner-backend
sleep 3
systemctl status planner-backend
```

---

## ✨ КАК РАБОТАЕТ

1. **Client (Browser)**: Подключается к `wss://calendar.corestone.ru/api/v1/ws/notifications`
2. **Nginx**: Проксирует WebSocket соединение с заголовками `Upgrade` и `Connection`
3. **FastAPI Backend**: Принимает WebSocket, аутентифицирует пользователя
4. **Redis Pub/Sub**: Celery tasks публикуют уведомления в Redis канал `notifications:{user_id}`
5. **Redis Listener**: Backend подписан на все каналы, получает сообщения
6. **WebSocket Manager**: Отправляет сообщение через открытое WebSocket соединение
7. **Client**: Получает уведомление мгновенно! 🎉

---

## 📊 FALLBACK МЕХАНИЗМ

Если WebSocket недоступен:
- ✅ Frontend автоматически переключается на **HTTP polling** (каждые 60 секунд)
- ✅ Уведомления всё равно работают (но с задержкой)
- ⚠️ В консоли будет: `[Notifications] WebSocket disconnected - falling back to polling`

---

**Последнее обновление:** 16 января 2026

