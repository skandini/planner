"""Script to update SQLite schema with new ticket columns."""
import sqlite3

DB_PATH = "calendar.db"

def update_schema():
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    # Check existing columns
    cursor.execute("PRAGMA table_info(tickets)")
    existing_columns = {row[1] for row in cursor.fetchall()}
    print(f"Existing columns: {existing_columns}")
    
    # New columns to add
    new_columns = [
        ("category_id", "TEXT"),
        ("due_date", "DATETIME"),
        ("first_response_at", "DATETIME"),
        ("sla_breach", "BOOLEAN DEFAULT 0"),
        ("tags", "TEXT"),
    ]
    
    for col_name, col_type in new_columns:
        if col_name not in existing_columns:
            try:
                sql = f"ALTER TABLE tickets ADD COLUMN {col_name} {col_type}"
                print(f"Adding column: {sql}")
                cursor.execute(sql)
                print(f"  ✓ Added {col_name}")
            except sqlite3.OperationalError as e:
                print(f"  ✗ Error adding {col_name}: {e}")
        else:
            print(f"  - Column {col_name} already exists")
    
    # Create new tables if they don't exist
    # TicketCategory table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS ticket_categories (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL UNIQUE,
            description TEXT,
            color TEXT DEFAULT '#6B7280',
            icon TEXT,
            parent_id TEXT,
            sort_order INTEGER DEFAULT 0,
            is_active BOOLEAN DEFAULT 1,
            created_at DATETIME NOT NULL,
            updated_at DATETIME NOT NULL,
            FOREIGN KEY (parent_id) REFERENCES ticket_categories(id)
        )
    """)
    print("✓ Created/verified ticket_categories table")
    
    # TicketHistory table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS ticket_history (
            id TEXT PRIMARY KEY,
            ticket_id TEXT NOT NULL,
            user_id TEXT NOT NULL,
            action TEXT NOT NULL,
            field_name TEXT,
            old_value TEXT,
            new_value TEXT,
            details TEXT,
            created_at DATETIME NOT NULL,
            FOREIGN KEY (ticket_id) REFERENCES tickets(id),
            FOREIGN KEY (user_id) REFERENCES users(id)
        )
    """)
    print("✓ Created/verified ticket_history table")
    
    # TicketInternalNote table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS ticket_internal_notes (
            id TEXT PRIMARY KEY,
            ticket_id TEXT NOT NULL,
            user_id TEXT NOT NULL,
            content TEXT NOT NULL,
            is_pinned BOOLEAN DEFAULT 0,
            created_at DATETIME NOT NULL,
            updated_at DATETIME NOT NULL,
            is_deleted BOOLEAN DEFAULT 0,
            deleted_at DATETIME,
            FOREIGN KEY (ticket_id) REFERENCES tickets(id),
            FOREIGN KEY (user_id) REFERENCES users(id)
        )
    """)
    print("✓ Created/verified ticket_internal_notes table")
    
    conn.commit()
    conn.close()
    print("\n✅ Schema update completed!")

if __name__ == "__main__":
    update_schema()

