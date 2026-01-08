-- Индексы для оптимизации производительности БД
-- Применять после миграций: psql -d your_database -f add_performance_indexes.sql

-- Индексы для таблицы events (критично для производительности)
CREATE INDEX IF NOT EXISTS idx_events_calendar_id ON events(calendar_id);
CREATE INDEX IF NOT EXISTS idx_events_starts_at ON events(starts_at);
CREATE INDEX IF NOT EXISTS idx_events_ends_at ON events(ends_at);
CREATE INDEX IF NOT EXISTS idx_events_room_id ON events(room_id);
CREATE INDEX IF NOT EXISTS idx_events_recurrence_parent_id ON events(recurrence_parent_id) 
    WHERE recurrence_parent_id IS NOT NULL;

-- Составной индекс для поиска событий в диапазоне дат по календарю
CREATE INDEX IF NOT EXISTS idx_events_calendar_date_range 
    ON events(calendar_id, starts_at, ends_at);

-- Индексы для участников событий (критично для N+1 проблем)
CREATE INDEX IF NOT EXISTS idx_event_participants_event_id ON event_participants(event_id);
CREATE INDEX IF NOT EXISTS idx_event_participants_user_id ON event_participants(user_id);
CREATE INDEX IF NOT EXISTS idx_event_participants_status ON event_participants(response_status);

-- Составной индекс для быстрого поиска участников события со статусом
CREATE INDEX IF NOT EXISTS idx_event_participants_event_status 
    ON event_participants(event_id, response_status);

-- Индексы для уведомлений (критично для периодических задач Celery)
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_event_id ON notifications(event_id);
CREATE INDEX IF NOT EXISTS idx_notifications_type ON notifications(type);
CREATE INDEX IF NOT EXISTS idx_notifications_scheduled_for ON notifications(scheduled_for) 
    WHERE scheduled_for IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_notifications_sent_at ON notifications(sent_at) 
    WHERE sent_at IS NULL;

-- Составной индекс для поиска неотправленных напоминаний (для Celery Beat)
CREATE INDEX IF NOT EXISTS idx_notifications_reminders 
    ON notifications(type, scheduled_for, sent_at, is_deleted) 
    WHERE type = 'event_reminder' AND sent_at IS NULL AND is_deleted = false;

-- Индексы для календарей
CREATE INDEX IF NOT EXISTS idx_calendars_owner_id ON calendars(owner_id);
CREATE INDEX IF NOT EXISTS idx_calendars_organization_id ON calendars(organization_id) 
    WHERE organization_id IS NOT NULL;

-- Индексы для пользователей
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_department_id ON users(department_id) 
    WHERE department_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_users_is_active ON users(is_active) 
    WHERE is_active = true;

-- Индексы для вложений событий
CREATE INDEX IF NOT EXISTS idx_event_attachments_event_id ON event_attachments(event_id);

-- Индексы для комментариев событий
CREATE INDEX IF NOT EXISTS idx_event_comments_event_id ON event_comments(event_id);
CREATE INDEX IF NOT EXISTS idx_event_comments_created_at ON event_comments(created_at);

-- Анализ статистики для оптимизатора запросов
ANALYZE events;
ANALYZE event_participants;
ANALYZE notifications;
ANALYZE calendars;
ANALYZE users;

