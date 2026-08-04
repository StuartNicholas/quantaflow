-- Extend activity_logs so each entry can answer who/what/where/when.
-- entity_name: cached at write time so the feed doesn't need a join.
-- project_id:  context column — most entity operations are project-scoped.
-- user_name:   denormalised at write time to avoid a join on every feed render.
ALTER TABLE activity_logs ADD COLUMN IF NOT EXISTS entity_name text;
ALTER TABLE activity_logs ADD COLUMN IF NOT EXISTS project_id  uuid;
ALTER TABLE activity_logs ADD COLUMN IF NOT EXISTS user_name   text;

CREATE INDEX IF NOT EXISTS idx_activity_logs_project ON activity_logs (project_id, created_at DESC);
