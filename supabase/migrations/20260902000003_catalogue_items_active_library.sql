-- Extend catalogue_items to serve as the company Active Library.
-- All new columns have safe defaults — existing rows are unaffected.
-- Existing RLS policies (company_id + can_edit_library()) cover the new columns.
--
-- price_source values:
--   'supplier' = company accepted supplier catalogue list price; rate recomputable from supplier data
--   'account'  = company's negotiated account price; CSV updates flag-stale only, never auto-update
--   'manual'   = company controls rate directly; buy_price may be null
--
-- For sheet items:  rate = (buy_price / sheet_area_m2) * waste_factor  ($/m2)
-- For all others:   rate = buy_price * waste_factor  ($/unit)
-- buy_price is always per-unit (pack_price / pack_quantity already resolved).

ALTER TABLE catalogue_items
  ADD COLUMN IF NOT EXISTS supplier_product_id  uuid REFERENCES supplier_products(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS supplier_id          uuid REFERENCES suppliers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS sku                  text,
  ADD COLUMN IF NOT EXISTS brand                text,
  ADD COLUMN IF NOT EXISTS thickness_mm         numeric(6,2),
  ADD COLUMN IF NOT EXISTS colour               text,
  ADD COLUMN IF NOT EXISTS finish               text,
  ADD COLUMN IF NOT EXISTS range                text,
  ADD COLUMN IF NOT EXISTS material_type        text,
  ADD COLUMN IF NOT EXISTS category             text,
  ADD COLUMN IF NOT EXISTS subcategory          text,
  ADD COLUMN IF NOT EXISTS purchase_unit        text,
  ADD COLUMN IF NOT EXISTS pack_quantity        numeric(10,4),
  ADD COLUMN IF NOT EXISTS pack_price           numeric(12,4),
  ADD COLUMN IF NOT EXISTS buy_price            numeric(12,4),
  ADD COLUMN IF NOT EXISTS waste_factor         numeric(6,4) NOT NULL DEFAULT 1.0,
  ADD COLUMN IF NOT EXISTS price_source         text NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS active               boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS last_reviewed_at     timestamptz,
  ADD COLUMN IF NOT EXISTS supplier_price_date  date,
  ADD COLUMN IF NOT EXISTS price_stale          boolean NOT NULL DEFAULT false;

-- Prevents activating the same supplier product twice in one company's library.
CREATE UNIQUE INDEX IF NOT EXISTS ci_supplier_product_unique_idx
  ON catalogue_items(company_id, supplier_product_id)
  WHERE supplier_product_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS ci_active_idx
  ON catalogue_items(company_id, active);

CREATE INDEX IF NOT EXISTS ci_category_idx
  ON catalogue_items(company_id, category);

CREATE INDEX IF NOT EXISTS ci_stale_idx
  ON catalogue_items(company_id, price_stale)
  WHERE price_stale = true;
