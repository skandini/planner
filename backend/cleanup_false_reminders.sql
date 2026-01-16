-- Очистка ложных напоминаний о событиях
-- Удаляем все напоминания типа event_reminder которые были созданы с неправильной логикой

-- 1. Посмотреть сколько ложных напоминаний
SELECT 
    COUNT(*) as total_reminders,
    SUM(CASE WHEN is_read = false THEN 1 ELSE 0 END) as unread_reminders
FROM notifications
WHERE type = 'event_reminder';

-- 2. Посмотреть примеры ложных напоминаний
SELECT 
    n.id,
    n.title,
    n.message,
    n.created_at,
    e.title as event_title,
    e.starts_at as event_start,
    n.is_read
FROM notifications n
LEFT JOIN events e ON n.event_id = e.id
WHERE n.type = 'event_reminder'
ORDER BY n.created_at DESC
LIMIT 10;

-- 3. Удалить все напоминания типа event_reminder
-- ОСТОРОЖНО: выполняйте только если уверены!
DELETE FROM notifications
WHERE type = 'event_reminder';

-- 4. Проверка после удаления
SELECT COUNT(*) as remaining_reminders
FROM notifications
WHERE type = 'event_reminder';

