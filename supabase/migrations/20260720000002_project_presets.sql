-- ============================================================
-- Verixo — Project Preset Fields
-- Adds the full project setup data to the projects table.
-- ============================================================

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS builder_id                uuid REFERENCES builders(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS tender_number             text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS project_number            text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS revision                  text NOT NULL DEFAULT '1',
  ADD COLUMN IF NOT EXISTS estimator                 text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS currency                  text NOT NULL DEFAULT 'AUD',
  ADD COLUMN IF NOT EXISTS breakdown_preference      text NOT NULL DEFAULT 'unit_type'
    CONSTRAINT projects_breakdown_pref_check
    CHECK (breakdown_preference IN ('unit_type','joinery_type','unit_number')),
  ADD COLUMN IF NOT EXISTS default_trade_scope       text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS default_pricing_library   text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS default_material_library  text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS default_hardware_library  text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS workflow_mode             text NOT NULL DEFAULT 'manual'
    CONSTRAINT projects_workflow_mode_check
    CHECK (workflow_mode IN ('manual','ai_assisted','ai_takeoff')),
  ADD COLUMN IF NOT EXISTS project_setup_complete    boolean NOT NULL DEFAULT false;

-- Index for looking up projects by builder
CREATE INDEX IF NOT EXISTS projects_builder_id_idx ON projects(builder_id) WHERE builder_id IS NOT NULL;
