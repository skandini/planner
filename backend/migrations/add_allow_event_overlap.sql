-- Миграция: добавление поля allow_event_overlap для пользователей
-- Позволяет пользователю разрешить другим приглашать его на наслаивающиеся события

DO $$
BEGIN
    -- Добавляем колонку allow_event_overlap если её нет
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'users' AND column_name = 'allow_event_overlap'
    ) THEN
        ALTER TABLE users ADD COLUMN allow_event_overlap BOOLEAN NOT NULL DEFAULT FALSE;
        RAISE NOTICE 'Added allow_event_overlap column to users table';
    ELSE
        RAISE NOTICE 'Column allow_event_overlap already exists in users table';
    END IF;
END $$;

