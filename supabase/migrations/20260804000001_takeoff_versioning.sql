-- Takeoff versioning: preserve history instead of deleting on re-import.
-- saveTakeoff() now archives the previous record (sets superseded_at) rather
-- than deleting it. getTakeoff() returns the active (non-superseded) record.
ALTER TABLE takeoffs ADD COLUMN IF NOT EXISTS version_number integer NOT NULL DEFAULT 1;
ALTER TABLE takeoffs ADD COLUMN IF NOT EXISTS superseded_at timestamptz;

-- Index so active-record lookups stay fast as version history grows.
CREATE INDEX IF NOT EXISTS idx_takeoffs_active ON takeoffs (project_id) WHERE superseded_at IS NULL;
