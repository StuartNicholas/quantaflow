-- Supplier import batch provenance.
-- Append-only: SELECT + INSERT only (no UPDATE/DELETE policies).
-- Must be created before supplier_products which references it.

CREATE TABLE IF NOT EXISTS supplier_import_batches (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  supplier_id     uuid REFERENCES suppliers(id) ON DELETE SET NULL,
  supplier_name   text NOT NULL,
  filename        text,
  row_count       integer NOT NULL DEFAULT 0,
  created_count   integer NOT NULL DEFAULT 0,
  updated_count   integer NOT NULL DEFAULT 0,
  unchanged_count integer NOT NULL DEFAULT 0,
  rejected_count  integer NOT NULL DEFAULT 0,
  imported_by     uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  imported_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS sib_company_idx
  ON supplier_import_batches(company_id, imported_at DESC);

ALTER TABLE supplier_import_batches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sib_select" ON supplier_import_batches
  FOR SELECT USING (company_id = my_company_id());

CREATE POLICY "sib_insert" ON supplier_import_batches
  FOR INSERT WITH CHECK (company_id = my_company_id() AND can_edit_library());
