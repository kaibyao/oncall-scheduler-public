-- Create users table to centralize user data and support platform ID caching
-- This replaces the hardcoded rotationEmails constant with database-backed user management
--
-- CRITICAL: Rotation Field Constraints
-- - rotation field contains ONLY 'AM' or 'PM' (never 'Core')  
-- - Core is not a direct engineer assignment - it's a shift type
-- - AM engineers can work: AM shifts + Core shifts
-- - PM engineers can work: PM shifts + Core shifts
-- - Core shifts can be filled by ANY engineer (AM or PM qualified)

CREATE TABLE IF NOT EXISTS users (
  email TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  slack_user_id TEXT,
  notion_person_id TEXT,
  rotation TEXT NOT NULL, -- 'AM' or 'PM' ONLY (never 'Core' directly)
  pod TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for efficient reverse lookups by platform IDs
CREATE INDEX IF NOT EXISTS idx_users_slack_user_id ON users(slack_user_id);
CREATE INDEX IF NOT EXISTS idx_users_notion_person_id ON users(notion_person_id);

-- Create index for rotation-based queries (used by schedule generation)
CREATE INDEX IF NOT EXISTS idx_users_rotation ON users(rotation);

-- Create index for pod-based queries (used by schedule generation)
CREATE INDEX IF NOT EXISTS idx_users_pod ON users(pod);
