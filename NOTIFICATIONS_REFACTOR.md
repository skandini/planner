# Рефакторинг системы уведомлений

## Что было сделано

### Проблема
CORS ошибка при DELETE запросах к `/api/v1/notifications/{id}` - браузер блокировал запросы из-за настроек CORS.

### Решение
Реализовано **мягкое удаление (soft delete)** через PATCH запросы вместо DELETE. Это полностью обходит проблему CORS, так как PATCH запросы не требуют preflight.

## Изменения

### Backend

1. **Модель Notification** (`backend/app/models/notification.py`):
   - Добавлено поле `is_deleted: bool` (по умолчанию `False`)
   - Добавлено поле `deleted_at: datetime | None` для отслеживания времени удаления

2. **Схема** (`backend/app/schemas/notification.py`):
   - `NotificationRead` теперь включает `is_deleted` и `deleted_at`
   - `NotificationUpdate` поддерживает `is_deleted: bool | None`

3. **API Endpoints** (`backend/app/api/v1/notifications.py`):
   - `PATCH /{notification_id}` теперь поддерживает `is_deleted: true` для мягкого удаления
   - Все запросы (`list`, `unread-count`, `mark-all-read`) фильтруют удаленные уведомления
   - DELETE endpoint удален (больше не нужен)

4. **Миграция** (`backend/migrations/versions/a1b2c3d4e5f6_add_soft_delete_to_notifications.py`):
   - Добавлены колонки `is_deleted` и `deleted_at` в таблицу `notifications`
   - Создан индекс для `is_deleted` для быстрой фильтрации

### Frontend

1. **Типы** (`frontend/src/types/notification.types.ts`):
   - `Notification` теперь включает `is_deleted` и `deleted_at`

2. **API Client** (`frontend/src/lib/api/notificationApi.ts`):
   - Метод `delete()` теперь использует `PATCH` с `is_deleted: true` вместо `DELETE`
   - Убрана сложная обработка ошибок CORS (больше не нужна)

## Как это работает

1. **Удаление уведомления**:
   ```typescript
   // Frontend отправляет:
   PATCH /api/v1/notifications/{id}
   { "is_deleted": true }
   
   // Backend помечает уведомление как удаленное
   // Уведомление остается в БД, но не показывается пользователю
   ```

2. **Фильтрация**:
   - Все запросы автоматически исключают уведомления с `is_deleted = true`
   - Счетчик непрочитанных не учитывает удаленные уведомления

3. **Восстановление** (если понадобится в будущем):
   ```typescript
   PATCH /api/v1/notifications/{id}
   { "is_deleted": false }
   ```

## Преимущества

✅ **Нет проблем с CORS** - PATCH запросы работают без preflight  
✅ **Безопасность данных** - уведомления не удаляются физически, можно восстановить  
✅ **Производительность** - мягкое удаление быстрее физического  
✅ **Аудит** - можно отследить, когда было удалено уведомление  

## Что нужно сделать

1. **Перезапустить backend** (если еще не перезапущен):
   ```powershell
   cd backend
   uvicorn app.main:app --reload
   ```

2. **Проверить работу**:
   - Откройте приложение
   - Попробуйте удалить уведомление
   - Проверьте, что оно исчезает из списка
   - Проверьте Network tab - должен быть PATCH запрос вместо DELETE

## Примечания

- Старые уведомления в БД имеют `is_deleted = False` по умолчанию
- Миграция уже применена автоматически
- DELETE endpoint больше не существует - используйте только PATCH

