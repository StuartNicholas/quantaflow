-- Snapshot simple per-door and per-drawer hardware rates at project level.
-- Source fields in cabinet_formula: door_hardware_cost, drawer_hardware_cost.
-- NULL = not yet snapshotted; code falls back to live company rate.
-- Migration already applied to production on 2026-08-25.
ALTER TABLE project_cabinet_preset
  ADD COLUMN IF NOT EXISTS door_hardware_rate   numeric(10,4),
  ADD COLUMN IF NOT EXISTS drawer_hardware_rate numeric(10,4);
