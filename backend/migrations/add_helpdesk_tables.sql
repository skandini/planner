-- Migration: Add HELP DESK tables for full ticket management
-- Date: 2026-01-17
-- Description: Adds ticket categories, history tracking, and internal notes

-- ===== TICKET CATEGORIES =====
CREATE TABLE IF NOT EXISTS ticket_categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL,
    description VARCHAR(500),
    color VARCHAR(20) DEFAULT '#6366f1',
    icon VARCHAR(50),
    parent_id UUID REFERENCES ticket_categories(id),
    sort_order INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ticket_categories_name ON ticket_categories(name);
CREATE INDEX IF NOT EXISTS idx_ticket_categories_is_active ON ticket_categories(is_active);
CREATE INDEX IF NOT EXISTS idx_ticket_categories_parent_id ON ticket_categories(parent_id);

-- ===== TICKET HISTORY =====
CREATE TABLE IF NOT EXISTS ticket_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_id UUID NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id),
    action VARCHAR(50) NOT NULL,
    field_name VARCHAR(50),
    old_value VARCHAR(1000),
    new_value VARCHAR(1000),
    details VARCHAR(2000),
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ticket_history_ticket_id ON ticket_history(ticket_id);
CREATE INDEX IF NOT EXISTS idx_ticket_history_user_id ON ticket_history(user_id);
CREATE INDEX IF NOT EXISTS idx_ticket_history_action ON ticket_history(action);
CREATE INDEX IF NOT EXISTS idx_ticket_history_created_at ON ticket_history(created_at);

-- ===== TICKET INTERNAL NOTES =====
CREATE TABLE IF NOT EXISTS ticket_internal_notes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_id UUID NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id),
    content VARCHAR(5000) NOT NULL,
    is_pinned BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    is_deleted BOOLEAN DEFAULT FALSE,
    deleted_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_ticket_internal_notes_ticket_id ON ticket_internal_notes(ticket_id);
CREATE INDEX IF NOT EXISTS idx_ticket_internal_notes_user_id ON ticket_internal_notes(user_id);
CREATE INDEX IF NOT EXISTS idx_ticket_internal_notes_is_deleted ON ticket_internal_notes(is_deleted);
CREATE INDEX IF NOT EXISTS idx_ticket_internal_notes_created_at ON ticket_internal_notes(created_at);

-- ===== UPDATE TICKETS TABLE =====
-- Add new columns to tickets table

-- Category reference
ALTER TABLE tickets 
ADD COLUMN IF NOT EXISTS category_id UUID REFERENCES ticket_categories(id);

-- Due date for SLA tracking
ALTER TABLE tickets 
ADD COLUMN IF NOT EXISTS due_date TIMESTAMP;

-- First response time tracking
ALTER TABLE tickets 
ADD COLUMN IF NOT EXISTS first_response_at TIMESTAMP;

-- SLA breach flag
ALTER TABLE tickets 
ADD COLUMN IF NOT EXISTS sla_breach BOOLEAN DEFAULT FALSE;

-- Tags (comma-separated)
ALTER TABLE tickets 
ADD COLUMN IF NOT EXISTS tags VARCHAR(500);

-- Create indexes for new columns
CREATE INDEX IF NOT EXISTS idx_tickets_category_id ON tickets(category_id);
CREATE INDEX IF NOT EXISTS idx_tickets_due_date ON tickets(due_date);
CREATE INDEX IF NOT EXISTS idx_tickets_sla_breach ON tickets(sla_breach);

-- ===== INSERT DEFAULT CATEGORIES =====
INSERT INTO ticket_categories (name, description, color, icon, sort_order) VALUES
    ('Техническая проблема', 'Проблемы с работой системы', '#ef4444', '🔧', 1),
    ('Запрос на доступ', 'Запросы на предоставление доступа', '#3b82f6', '🔑', 2),
    ('Вопрос', 'Общие вопросы по работе системы', '#8b5cf6', '❓', 3),
    ('Предложение', 'Предложения по улучшению', '#10b981', '💡', 4),
    ('Ошибка данных', 'Проблемы с данными в системе', '#f59e0b', '📊', 5),
    ('Другое', 'Прочие обращения', '#6b7280', '📝', 99)
ON CONFLICT DO NOTHING;

-- ===== GRANT PERMISSIONS =====
-- Note: Replace 'planner_user' with your actual database user if different
-- GRANT ALL PRIVILEGES ON ticket_categories TO planner_user;
-- GRANT ALL PRIVILEGES ON ticket_history TO planner_user;
-- GRANT ALL PRIVILEGES ON ticket_internal_notes TO planner_user;

COMMENT ON TABLE ticket_categories IS 'Categories for ticket classification';
COMMENT ON TABLE ticket_history IS 'History of ticket changes (visible only to staff)';
COMMENT ON TABLE ticket_internal_notes IS 'Internal notes on tickets (visible only to staff)';

