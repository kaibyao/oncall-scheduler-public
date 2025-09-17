-- Seed users table from rotationEmails constant
-- This file migrates user data from the hardcoded rotationEmails constant to the users table
-- Only AM and PM rotations are migrated (Core rotation is ignored as per PRD requirements)

-- Insert AM rotation users (6 users)
INSERT INTO users (email, name, slack_user_id, notion_person_id, rotation, pod) VALUES
('eng.04@company.com', 'Engineer 4', NULL, NULL, 'AM', 'Swayze'),
('eng.05@company.com', 'Engineer 5', NULL, NULL, 'AM', 'Blinky'),
('eng.06@company.com', 'Engineer 6', NULL, NULL, 'AM', 'Swayze'),
('eng.07@company.com', 'Engineer 7', NULL, NULL, 'AM', 'Zero'),
('eng.08@company.com', 'Engineer 8', NULL, NULL, 'AM', 'Zero'),
('eng.09@company.com', 'Engineer 9', NULL, NULL, 'AM', 'Blinky');

-- Insert PM rotation users (10 users)
INSERT INTO users (email, name, slack_user_id, notion_person_id, rotation, pod) VALUES
('eng.10@company.com', 'Engineer 10', NULL, NULL, 'PM', 'Swayze'),
('eng.11@company.com', 'Engineer 11', NULL, NULL, 'PM', 'Swayze'),
('eng.02@company.com', 'Engineer 2', NULL, NULL, 'PM', 'Zero'),
('eng.12@company.com', 'Engineer 12', NULL, NULL, 'PM', 'Zero'),
('eng.13@company.com', 'Engineer 13', NULL, NULL, 'PM', 'Blinky'),
('eng.14@company.com', 'Engineer 14', NULL, NULL, 'PM', 'Blinky'),
('eng.15@company.com', 'Engineer 15', NULL, NULL, 'PM', 'Zero'),
('eng.03@company.com', 'Engineer 3', NULL, NULL, 'PM', 'Zero'),
('eng.16@company.com', 'Engineer 16', NULL, NULL, 'PM', 'Blinky'),
('eng.01@company.com', 'Engineer 1', NULL, NULL, 'PM', 'Zero');

-- Total: 16 users (6 AM + 10 PM)
-- All users have derived names from email prefixes with proper title casing
-- Platform IDs (slack_user_id, notion_person_id) set to NULL initially
-- Will be populated automatically when platform integrations run
