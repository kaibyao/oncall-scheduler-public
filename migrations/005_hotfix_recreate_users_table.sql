DROP TABLE IF EXISTS users;

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
