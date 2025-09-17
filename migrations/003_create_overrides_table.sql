CREATE TABLE IF NOT EXISTS oncall_schedule_overrides (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date DATE NOT NULL,
  rotation TEXT NOT NULL,
  engineer_email TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_oncall_schedule_overrides_engineer_email ON oncall_schedule_overrides(engineer_email);

CREATE UNIQUE INDEX IF NOT EXISTS idx_oncall_schedule_overrides_unique_date_rotation ON oncall_schedule_overrides(date, rotation);

-- Override data seeding has been moved to seed-data/
