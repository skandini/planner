-- Migration: Add last_activity column to users table for online status tracking
-- Run: PGPASSWORD='YtragtR65A' psql -h localhost -U planner_user -d planner_db -f backend/migrations/add_last_activity.sql

-- Add last_activity column if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'users' AND column_name = 'last_activity'
    ) THEN
        ALTER TABLE users ADD COLUMN last_activity TIMESTAMP NULL;
        CREATE INDEX IF NOT EXISTS ix_users_last_activity ON users(last_activity);
        RAISE NOTICE 'Added last_activity column to users table';
    ELSE
        RAISE NOTICE 'last_activity column already exists';
    END IF;
END $$;

