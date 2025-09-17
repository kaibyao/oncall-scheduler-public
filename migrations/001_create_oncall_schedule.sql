-- SQLite doesn't require explicit schema creation like PostgreSQL
-- but we can create the table directly

CREATE TABLE IF NOT EXISTS oncall_schedule (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date DATE NOT NULL,
  rotation TEXT NOT NULL,
  engineer_email TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_oncall_schedule_engineer_email ON oncall_schedule(engineer_email);

CREATE UNIQUE INDEX IF NOT EXISTS idx_oncall_schedule_unique_date_rotation ON oncall_schedule(date, rotation);
