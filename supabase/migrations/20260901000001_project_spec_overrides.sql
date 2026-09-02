-- Project Spec overrides: per-project material/hardware rates + room/unit-type JSON overrides.
-- Direct rates take precedence over catalogue-item rates when set.
-- room_overrides / unit_type_overrides are JSONB keyed by room name / unit type name.

ALTER TABLE project_cabinet_preset
  ADD COLUMN IF NOT EXISTS carcass_name        text,
  ADD COLUMN IF NOT EXISTS front_name          text,
  ADD COLUMN IF NOT EXISTS benchtop_name       text,
  ADD COLUMN IF NOT EXISTS benchtop_rate       numeric(10,4),
  ADD COLUMN IF NOT EXISTS hinge_name          text,
  ADD COLUMN IF NOT EXISTS handle_name         text,
  ADD COLUMN IF NOT EXISTS runner_name         text,
  ADD COLUMN IF NOT EXISTS foot_name           text,
  ADD COLUMN IF NOT EXISTS carcass_rate        numeric(10,4),
  ADD COLUMN IF NOT EXISTS front_rate          numeric(10,4),
  ADD COLUMN IF NOT EXISTS hinge_rate          numeric(10,4),
  ADD COLUMN IF NOT EXISTS handle_rate         numeric(10,4),
  ADD COLUMN IF NOT EXISTS foot_rate           numeric(10,4),
  ADD COLUMN IF NOT EXISTS room_overrides      jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS unit_type_overrides jsonb NOT NULL DEFAULT '{}'::jsonb;

-- Also add labour rate columns if not already added by 20260825000002
ALTER TABLE project_cabinet_preset
  ADD COLUMN IF NOT EXISTS rate_drafting  numeric(10,4),
  ADD COLUMN IF NOT EXISTS rate_cutting   numeric(10,4),
  ADD COLUMN IF NOT EXISTS rate_edging    numeric(10,4),
  ADD COLUMN IF NOT EXISTS rate_assembly  numeric(10,4),
  ADD COLUMN IF NOT EXISTS rate_packing   numeric(10,4);
