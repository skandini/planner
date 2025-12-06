# Инструкция по откату до версии без WebSocket

## Текущая ситуация

- **Текущий коммит**: `81653d5` (последние изменения)
- **Коммит перед WebSocket**: `a070e31` ("feat: add optimistic updates for participant status changes")
- **Первый коммит с WebSocket**: `fac385a` ("feat: add WebSocket server with JWT authentication for real-time updates")

## Варианты отката

### Вариант 1: Жесткий откат (удалит все изменения после a070e31)

```bash
git reset --hard a070e31
```

⚠️ **ВНИМАНИЕ**: Это удалит все коммиты после `a070e31`. Если нужно сохранить текущую работу, используйте Вариант 2.

### Вариант 2: Создать новую ветку от старого коммита (рекомендуется)

```bash
# Создать новую ветку от коммита без WebSocket
git checkout -b without-websocket a070e31

# Или переключиться на существующую ветку main/master и откатиться
git checkout main
git reset --hard a070e31
```

### Вариант 3: Откатить только WebSocket файлы вручную

Если нужно сохранить другие изменения, можно удалить только WebSocket-файлы:

**Backend:**
- `backend/app/websocket/` (вся папка)
- Удалить импорты WebSocket из `backend/app/main.py`
- Удалить импорты WebSocket из `backend/app/api/v1/events.py`
- Удалить `python-socketio` из `backend/requirements.txt`

**Frontend:**
- `frontend/src/hooks/useWebSocket.ts`
- Удалить импорты WebSocket из `frontend/src/app/page.tsx`
- Удалить `socket.io-client` из `frontend/package.json`

## Резервная копия

Создана резервная ветка `backup-before-rollback` с текущим состоянием.

Чтобы вернуться к текущему состоянию:
```bash
git checkout backup-before-rollback
```

## После отката

1. Удалить зависимости WebSocket:
   ```bash
   # Backend
   cd backend
   pip uninstall python-socketio
   
   # Frontend
   cd frontend
   npm uninstall socket.io-client
   ```

2. Перезапустить серверы

3. Проверить, что все работает без WebSocket


