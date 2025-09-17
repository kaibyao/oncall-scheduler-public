-- Schedule override data
-- This seed file contains exceptions to the main schedule

INSERT INTO oncall_schedule_overrides (date, rotation, engineer_email) VALUES
  ('2025-06-20', 'Core', 'eng.09@company.com'),
  ('2025-07-15', 'PM', 'eng.12@company.com'),
  ('2025-07-24', 'PM', 'eng.03@company.com'),
  ('2025-07-25', 'PM', 'eng.03@company.com'),
  ('2025-07-31', 'PM', 'eng.01@company.com'),
  ('2025-08-01', 'PM', 'eng.01@company.com'),
  ('2025-08-04', 'AM', 'eng.05@company.com'),
  ('2025-08-05', 'AM', 'eng.05@company.com'),
  ('2025-08-06', 'AM', 'eng.05@company.com'),
  ('2025-09-03', 'AM', 'eng.09@company.com'),
  ('2025-09-04', 'AM', 'eng.09@company.com'),
  ('2025-09-05', 'AM', 'eng.09@company.com');
