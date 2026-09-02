-- Supplier product catalogue.
-- Company-scoped copy of supplier price lists, populated by CSV import.
-- Never auto-syncs to Active Library (catalogue_items) — user must explicitly activate.
--
-- Duplicate guard uses lower(trim(sku)) to prevent case/whitespace variants of the
-- same SKU creating separate products for the same supplier.

CREATE TABLE IF NOT EXISTS supplier_products (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id          uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  supplier_id         uuid NOT NULL REFERENCES suppliers(id) ON DELETE RESTRICT,
  supplier_name       text NOT NULL,
  brand               text,
  sku                 text,
  product_name        text NOT NULL,
  description         text,
  category            text NOT NULL DEFAULT 'Other',
  subcategory         text,
  purchase_unit       text NOT NULL DEFAULT 'each',
  pack_quantity       numeric(10,4) NOT NULL DEFAULT 1,
  pack_price          numeric(12,4),
  unit_price          numeric(12,4),
  sheet_length_mm     numeric(10,2),
  sheet_width_mm      numeric(10,2),
  thickness_mm        numeric(6,2),
  colour              text,
  finish              text,
  range               text,
  material_type       text,
  supplier_price_date date,
  active              boolean NOT NULL DEFAULT true,
  discontinued_at     timestamptz,
  import_batch_id     uuid REFERENCES supplier_import_batches(id) ON DELETE SET NULL,
  import_source       text NOT NULL DEFAULT 'csv',
  notes               text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

-- Primary duplicate guard: company + supplier + normalised SKU (case-insensitive).
-- Matches the application-layer normaliseSkuForMatch() logic: lower(trim(sku)).
CREATE UNIQUE INDEX IF NOT EXISTS sp_sku_unique_idx
  ON supplier_products (company_id, supplier_id, lower(trim(sku)))
  WHERE sku IS NOT NULL AND trim(sku) <> '';

-- Fallback matching index: company + supplier + product name + category
CREATE INDEX IF NOT EXISTS sp_name_idx
  ON supplier_products(company_id, supplier_id, product_name, category);

CREATE INDEX IF NOT EXISTS sp_company_idx
  ON supplier_products(company_id);

CREATE INDEX IF NOT EXISTS sp_category_idx
  ON supplier_products(company_id, category);

CREATE INDEX IF NOT EXISTS sp_supplier_idx
  ON supplier_products(company_id, supplier_id);

ALTER TABLE supplier_products ENABLE ROW LEVEL SECURITY;

-- Any company member may browse the supplier catalogue.
CREATE POLICY "sp_select" ON supplier_products
  FOR SELECT USING (company_id = my_company_id());

-- Only library editors may create, update, or delete supplier products.
CREATE POLICY "sp_insert" ON supplier_products
  FOR INSERT WITH CHECK (company_id = my_company_id() AND can_edit_library());

CREATE POLICY "sp_update" ON supplier_products
  FOR UPDATE USING (company_id = my_company_id())
  WITH CHECK (company_id = my_company_id() AND can_edit_library());

CREATE POLICY "sp_delete" ON supplier_products
  FOR DELETE USING (company_id = my_company_id() AND can_edit_library());
