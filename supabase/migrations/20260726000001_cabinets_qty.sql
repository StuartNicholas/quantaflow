-- Add qty column to cabinets table for AI draft rows
-- AI takeoff extracts e.g. "3× Base Cabinet 600mm" — qty stores that count
-- rather than creating N identical rows. Defaults to 1 for all existing rows.
ALTER TABLE cabinets ADD COLUMN IF NOT EXISTS qty integer NOT NULL DEFAULT 1;
