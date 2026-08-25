-- Production labour rates on cabinet_formula (company-level defaults).
-- default_hrs jsonb stores per-cabinet production hours keyed by "Type|Config|Width".
-- Labour $/hr rates are project-snapshot-able via project_cabinet_preset.
ALTER TABLE cabinet_formula
  ADD COLUMN IF NOT EXISTS default_hrs            jsonb        DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS default_hrs_seeded_at  timestamptz,
  ADD COLUMN IF NOT EXISTS rate_drafting          numeric(10,4),
  ADD COLUMN IF NOT EXISTS rate_cutting           numeric(10,4),
  ADD COLUMN IF NOT EXISTS rate_edging            numeric(10,4),
  ADD COLUMN IF NOT EXISTS rate_assembly          numeric(10,4),
  ADD COLUMN IF NOT EXISTS rate_packing           numeric(10,4);

-- Per-project labour rate snapshot on project_cabinet_preset.
-- NULL = not yet snapshotted; code falls back to live company rate.
ALTER TABLE project_cabinet_preset
  ADD COLUMN IF NOT EXISTS rate_drafting     numeric(10,4),
  ADD COLUMN IF NOT EXISTS rate_cutting      numeric(10,4),
  ADD COLUMN IF NOT EXISTS rate_edging       numeric(10,4),
  ADD COLUMN IF NOT EXISTS rate_assembly     numeric(10,4),
  ADD COLUMN IF NOT EXISTS rate_packing      numeric(10,4);
