-- Fix: user_id should be integer to match users.id (not uuid)
-- Drop the uuid column and re-add as integer (no data to preserve — table is new)
ALTER TABLE report_jobs DROP COLUMN IF EXISTS user_id;
ALTER TABLE report_jobs ADD COLUMN user_id integer;
