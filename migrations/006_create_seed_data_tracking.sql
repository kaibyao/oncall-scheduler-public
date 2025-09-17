-- Create table to track applied seed data files
-- Similar to schema_migrations but for seed data

CREATE TABLE IF NOT EXISTS seed_data_applied (
  name TEXT PRIMARY KEY,
  applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO seed_data_applied (name, applied_at) VALUES
  ('001_initial_schedule', CURRENT_TIMESTAMP),
  ('002_schedule_overrides', CURRENT_TIMESTAMP);
