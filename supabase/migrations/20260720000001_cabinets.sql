-- ============================================================
-- Verixo — Cabinet Database
-- The core of the platform. Every other module references this.
-- ============================================================

CREATE TABLE IF NOT EXISTS cabinets (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id           uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  project_id           uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,

  -- Location hierarchy
  building             text NOT NULL DEFAULT '',
  level                text NOT NULL DEFAULT '',
  unit_type            text NOT NULL DEFAULT '',
  joinery_type         text NOT NULL DEFAULT '',
  room                 text NOT NULL DEFAULT '',

  -- Identification
  cabinet_number       text NOT NULL DEFAULT '',
  cabinet_type         text NOT NULL DEFAULT '',
  description          text NOT NULL DEFAULT '',

  -- Dimensions (mm)
  width                numeric(10,2) NOT NULL DEFAULT 0,
  height               numeric(10,2) NOT NULL DEFAULT 0,
  depth                numeric(10,2) NOT NULL DEFAULT 0,

  -- Materials & finishes
  material             text NOT NULL DEFAULT '',
  door_style           text NOT NULL DEFAULT '',
  door_qty             integer NOT NULL DEFAULT 0,
  drawer_qty           integer NOT NULL DEFAULT 0,
  hardware             jsonb NOT NULL DEFAULT '[]'::jsonb,
  panels               jsonb NOT NULL DEFAULT '[]'::jsonb,
  has_benchtop         boolean NOT NULL DEFAULT false,
  benchtop_material    text NOT NULL DEFAULT '',
  has_kickboard        boolean NOT NULL DEFAULT true,

  -- Costing
  labour_hours         numeric(10,2) NOT NULL DEFAULT 0,
  unit_cost            numeric(12,2) NOT NULL DEFAULT 0,
  sell_price           numeric(12,2) NOT NULL DEFAULT 0,

  -- Production status
  status               text NOT NULL DEFAULT 'pending'
    CONSTRAINT cabinets_status_check
    CHECK (status IN ('pending','cutting','assembled','qc','dispatched','installed')),

  -- AI metadata
  ai_draft             boolean NOT NULL DEFAULT false,
  ai_source            text NOT NULL DEFAULT 'manual'
    CONSTRAINT cabinets_ai_source_check
    CHECK (ai_source IN ('manual','ai_assist','ai_takeoff')),
  ai_confidence        integer,
  ai_explanation       text,

  -- Ordering & audit
  sort_order           integer NOT NULL DEFAULT 0,
  created_by           uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by           uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);

-- Indexes for common query patterns
CREATE INDEX IF NOT EXISTS cabinets_project_id_idx    ON cabinets(project_id);
CREATE INDEX IF NOT EXISTS cabinets_company_id_idx    ON cabinets(company_id);
CREATE INDEX IF NOT EXISTS cabinets_room_idx          ON cabinets(project_id, room);
CREATE INDEX IF NOT EXISTS cabinets_status_idx        ON cabinets(project_id, status);
CREATE INDEX IF NOT EXISTS cabinets_ai_draft_idx      ON cabinets(project_id, ai_draft) WHERE ai_draft = true;
CREATE INDEX IF NOT EXISTS cabinets_sort_order_idx    ON cabinets(project_id, sort_order);

-- Row-level security: company members can access their project's cabinets
ALTER TABLE cabinets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "company_members_cabinet_access" ON cabinets
  FOR ALL USING (
    company_id IN (
      SELECT company_id FROM profiles WHERE id = auth.uid()
    )
  );

-- Auto-stamp updated_at on every row update
CREATE OR REPLACE FUNCTION _verixo_cabinets_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS cabinets_updated_at ON cabinets;
CREATE TRIGGER cabinets_updated_at
  BEFORE UPDATE ON cabinets
  FOR EACH ROW EXECUTE FUNCTION _verixo_cabinets_updated_at();
