import { supabase } from "../supabase";
import { getIdentity, errMsg, logActivity, DbResult } from "./_base";

// ─────────────────────────────────────────────────────────────────────────────
// Supplier Products + Company Active Library data access.
//
// Two-phase import keeps the preview completely read-only:
//   previewSupplierImport()   — validate / classify only, zero DB writes
//   confirmSupplierImport()   — execute confirmed rows, flag stale library links
//
// Active Library:
//   activateToLibrary()       — promote supplier_product → catalogue_items
//   reviewStaleItem()         — price-update review (accept / keep / update)
//
// Pricing model (no price_override — three clean states via price_source):
//   'supplier'  buy_price = accepted supplier unit_price → compute rate
//   'account'   buy_price = company negotiated price    → compute rate
//   'manual'    rate set directly; buy_price may be null
//
// Sheet rate formula:  rate = (buy_price / sheet_area_m2) * waste_factor  $/m2
// All other units:     rate = buy_price * waste_factor  $/unit
// ─────────────────────────────────────────────────────────────────────────────

export type SupplierProduct = {
  id: string;
  company_id: string;
  supplier_id: string;
  supplier_name: string;
  brand?: string | null;
  sku?: string | null;
  product_name: string;
  description?: string | null;
  category: string;
  subcategory?: string | null;
  purchase_unit: string;
  pack_quantity: number;
  pack_price?: number | null;
  unit_price?: number | null;
  sheet_length_mm?: number | null;
  sheet_width_mm?: number | null;
  thickness_mm?: number | null;
  colour?: string | null;
  finish?: string | null;
  range?: string | null;
  material_type?: string | null;
  supplier_price_date?: string | null;
  active: boolean;
  discontinued_at?: string | null;
  import_batch_id?: string | null;
  import_source: string;
  notes?: string | null;
  created_at?: string;
  updated_at?: string;
};

export type SupplierImportBatch = {
  id: string;
  company_id: string;
  supplier_id?: string | null;
  supplier_name: string;
  filename?: string | null;
  row_count: number;
  created_count: number;
  updated_count: number;
  unchanged_count: number;
  rejected_count: number;
  imported_by?: string | null;
  imported_at: string;
};

export type ImportRowClassification = "new" | "update" | "unchanged" | "rejected";

export type FieldChange = { from: string | number | null; to: string | number | null };

export type ImportPreviewRow = {
  rowIndex: number;
  classification: ImportRowClassification;
  rejectionReason?: string;
  supplierProductId?: string;
  changes?: Record<string, FieldChange>;
  data: Partial<SupplierProduct>;
};

export type ImportPreviewResult = {
  supplierId: string;
  supplierName: string;
  supplierPriceDate?: string | null;
  filename?: string | null;
  rows: ImportPreviewRow[];
  counts: { new: number; update: number; unchanged: number; rejected: number };
};

export type MappedImportRow = {
  supplier?: string;
  brand?: string;
  sku?: string;
  product_name?: string;
  description?: string;
  category?: string;
  subcategory?: string;
  purchase_unit?: string;
  pack_quantity?: string;
  pack_price?: string;
  sheet_length_mm?: string;
  sheet_width_mm?: string;
  thickness_mm?: string;
  colour?: string;
  finish?: string;
  range?: string;
  material_type?: string;
  supplier_price_date?: string;
  active?: string;
  notes?: string;
};

const VALID_CATEGORIES = new Set([
  "Board", "Hinge", "Handle", "Drawer System", "Benchtop", "Foot", "Consumable", "Other",
]);

const VALID_PURCHASE_UNITS = new Set([
  "sheet", "m2", "each", "pack", "set", "pair", "lm",
]);

/** Normalise SKU for identity matching — must match the DB index: lower(trim(sku)). */
export function normalizeSkuForMatch(sku: string): string {
  return sku.trim().toLowerCase();
}

/**
 * Compute the effective estimating rate stored in catalogue_items.rate.
 *
 * Sheet goods:   rate = (unit_price / sheet_area_m2) * waste_factor   $/m2
 * All others:    rate = unit_price * waste_factor                      $/unit
 *
 * Returns null if required inputs are missing or zero (prevents storing $0).
 */
export function computeEffectiveRate(
  purchaseUnit: string,
  unitPrice: number,
  wasteFactor: number,
  sheetLengthMm?: number | null,
  sheetWidthMm?: number | null
): number | null {
  if (!unitPrice || unitPrice <= 0) return null;
  const wf = wasteFactor > 0 ? wasteFactor : 1.0;
  if (purchaseUnit === "sheet") {
    if (!sheetLengthMm || sheetLengthMm <= 0 || !sheetWidthMm || sheetWidthMm <= 0) return null;
    const areaM2 = (sheetLengthMm * sheetWidthMm) / 1_000_000;
    if (areaM2 <= 0) return null;
    return Math.round(((unitPrice / areaM2) * wf) * 10000) / 10000;
  }
  return Math.round(unitPrice * wf * 10000) / 10000;
}

// ─── Internal helpers ────────────────────────────────────────────────────────

function parseNum(v: string | undefined): number | null {
  if (!v || !v.trim()) return null;
  const n = parseFloat(v.replace(/[^0-9.\-]/g, ""));
  return isNaN(n) ? null : n;
}

function parseBool(v: string | undefined): boolean {
  if (!v) return true;
  const l = v.toLowerCase().trim();
  return !(l === "false" || l === "0" || l === "no" || l === "n");
}

function norm(s: string | undefined | null): string {
  return (s || "").trim();
}

function validateRow(
  raw: MappedImportRow,
  supplierId: string,
  supplierName: string
): { valid: true; data: Partial<SupplierProduct> } | { valid: false; reason: string } {
  const product_name = norm(raw.product_name);
  if (!product_name) return { valid: false, reason: "product_name is required" };

  const pack_price_raw = parseNum(raw.pack_price);
  if (pack_price_raw === null || pack_price_raw <= 0)
    return { valid: false, reason: "pack_price must be a positive number" };

  const catRaw = norm(raw.category) || "Other";
  const catKey = [...VALID_CATEGORIES].find(c => c.toLowerCase() === catRaw.toLowerCase());
  if (!catKey)
    return { valid: false, reason: `category "${catRaw}" invalid — must be one of: ${[...VALID_CATEGORIES].join(", ")}` };

  const puRaw = (norm(raw.purchase_unit) || "each").toLowerCase();
  const puKey = [...VALID_PURCHASE_UNITS].find(u => u === puRaw);
  if (!puKey)
    return { valid: false, reason: `purchase_unit "${puRaw}" invalid — must be one of: ${[...VALID_PURCHASE_UNITS].join(", ")}` };

  const pack_qty = parseNum(raw.pack_quantity) ?? 1;
  if (pack_qty <= 0) return { valid: false, reason: "pack_quantity must be positive" };

  const pack_price = pack_price_raw;
  const unit_price = Math.round((pack_price / pack_qty) * 10000) / 10000;

  const sheet_length_mm = parseNum(raw.sheet_length_mm);
  const sheet_width_mm  = parseNum(raw.sheet_width_mm);

  if (puKey === "sheet") {
    if (!sheet_length_mm || sheet_length_mm <= 0)
      return { valid: false, reason: "sheet_length_mm required for purchase_unit=sheet" };
    if (!sheet_width_mm || sheet_width_mm <= 0)
      return { valid: false, reason: "sheet_width_mm required for purchase_unit=sheet" };
  }

  const spd = norm(raw.supplier_price_date) || null;
  if (spd && !/^\d{4}-\d{2}-\d{2}$/.test(spd))
    return { valid: false, reason: `supplier_price_date "${spd}" must be YYYY-MM-DD` };

  return {
    valid: true,
    data: {
      supplier_id: supplierId,
      supplier_name: supplierName,
      brand: norm(raw.brand) || null,
      sku: norm(raw.sku) || null,
      product_name,
      description: norm(raw.description) || null,
      category: catKey,
      subcategory: norm(raw.subcategory) || null,
      purchase_unit: puKey,
      pack_quantity: pack_qty,
      pack_price,
      unit_price,
      sheet_length_mm: sheet_length_mm || null,
      sheet_width_mm: sheet_width_mm || null,
      thickness_mm: parseNum(raw.thickness_mm),
      colour: norm(raw.colour) || null,
      finish: norm(raw.finish) || null,
      range: norm(raw.range) || null,
      material_type: norm(raw.material_type) || null,
      supplier_price_date: spd,
      active: parseBool(raw.active),
      notes: norm(raw.notes) || null,
      import_source: "csv",
    },
  };
}

function buildChanges(
  existing: Record<string, any>,
  incoming: Partial<SupplierProduct>
): Record<string, FieldChange> {
  const changes: Record<string, FieldChange> = {};
  const fields = [
    "product_name", "brand", "pack_price", "unit_price", "pack_quantity",
    "sheet_length_mm", "sheet_width_mm", "thickness_mm", "colour", "finish",
    "range", "material_type", "subcategory", "supplier_price_date", "active", "notes",
  ];
  for (const f of fields) {
    const oldV = existing[f] ?? null;
    const newV = (incoming as any)[f] ?? null;
    if (String(oldV) !== String(newV)) {
      changes[f] = { from: oldV, to: newV };
    }
  }
  return changes;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Preview a supplier CSV import without writing anything to the database.
 *
 * Receives mapped rows (column mapping already applied by the UI component),
 * validates each row, fetches existing supplier products for comparison, and
 * classifies each as new / update / unchanged / rejected.
 *
 * NO inserts. NO updates. NO stale flags. NO batch records.
 */
export async function previewSupplierImport(
  rows: MappedImportRow[],
  supplierId: string,
  supplierName: string,
  supplierPriceDate?: string | null,
  filename?: string | null
): Promise<DbResult<ImportPreviewResult>> {
  try {
    const { companyId } = await getIdentity();
    if (!companyId) return { data: null, error: "Not signed in." };

    const { data: existing, error: fetchErr } = await supabase
      .from("supplier_products")
      .select("id,sku,product_name,category,pack_price,unit_price,pack_quantity,supplier_price_date,brand,colour,finish,thickness_mm,sheet_length_mm,sheet_width_mm,range,material_type,subcategory,active,notes")
      .eq("company_id", companyId)
      .eq("supplier_id", supplierId);

    if (fetchErr) return { data: null, error: errMsg(fetchErr) };
    const existingArr = (existing || []) as SupplierProduct[];

    const seenSkus = new Set<string>();
    const previewRows: ImportPreviewRow[] = [];

    for (let i = 0; i < rows.length; i++) {
      const raw = rows[i];
      const rowWithDate: MappedImportRow = {
        ...raw,
        supplier_price_date: norm(raw.supplier_price_date) || supplierPriceDate || undefined,
      };

      const validated = validateRow(rowWithDate, supplierId, supplierName);
      if (!validated.valid) {
        previewRows.push({ rowIndex: i, classification: "rejected", rejectionReason: validated.reason, data: {} });
        continue;
      }

      const { data: d } = validated;
      const sku = d.sku;
      const skuNorm = sku ? normalizeSkuForMatch(sku) : null;

      if (skuNorm) {
        if (seenSkus.has(skuNorm)) {
          previewRows.push({ rowIndex: i, classification: "rejected", rejectionReason: `Duplicate SKU in file: "${sku}"`, data: d });
          continue;
        }
        seenSkus.add(skuNorm);
      }

      let match: SupplierProduct | undefined;
      if (skuNorm) {
        match = existingArr.find(e => e.sku != null && normalizeSkuForMatch(e.sku) === skuNorm);
      }
      if (!match) {
        match = existingArr.find(
          e => e.product_name.toLowerCase() === (d.product_name || "").toLowerCase()
            && e.category === d.category
        );
      }

      if (!match) {
        previewRows.push({ rowIndex: i, classification: "new", data: d });
      } else {
        const changes = buildChanges(match as any, d);
        const hasChanges = Object.keys(changes).length > 0;
        previewRows.push({
          rowIndex: i,
          classification: hasChanges ? "update" : "unchanged",
          supplierProductId: match.id,
          changes: hasChanges ? changes : undefined,
          data: d,
        });
      }
    }

    const counts = {
      new: previewRows.filter(r => r.classification === "new").length,
      update: previewRows.filter(r => r.classification === "update").length,
      unchanged: previewRows.filter(r => r.classification === "unchanged").length,
      rejected: previewRows.filter(r => r.classification === "rejected").length,
    };

    return {
      data: { supplierId, supplierName, supplierPriceDate: supplierPriceDate || null, filename: filename || null, rows: previewRows, counts },
      error: null,
    };
  } catch (e) {
    return { data: null, error: errMsg(e) };
  }
}

/**
 * Execute a confirmed supplier import.
 *
 * Creates the import batch, inserts confirmed new products, updates confirmed
 * changed ones, and sets price_stale=true on Active Library items linked to
 * any supplier product whose unit_price changed.
 */
export async function confirmSupplierImport(
  preview: ImportPreviewResult,
  confirmedRowIndices: Set<number>
): Promise<DbResult<SupplierImportBatch>> {
  try {
    const { userId, companyId } = await getIdentity();
    if (!companyId) return { data: null, error: "Not signed in." };

    const toCreate = preview.rows.filter(r => r.classification === "new" && confirmedRowIndices.has(r.rowIndex));
    const toUpdate = preview.rows.filter(r => r.classification === "update" && confirmedRowIndices.has(r.rowIndex));

    const { data: batch, error: batchErr } = await supabase
      .from("supplier_import_batches")
      .insert({
        company_id: companyId,
        supplier_id: preview.supplierId,
        supplier_name: preview.supplierName,
        filename: preview.filename,
        row_count: preview.rows.length,
        created_count: 0,
        updated_count: 0,
        unchanged_count: preview.counts.unchanged,
        rejected_count: preview.counts.rejected,
        imported_by: userId,
      })
      .select()
      .single();

    if (batchErr) return { data: null, error: errMsg(batchErr) };
    const batchId = batch.id;

    let createdCount = 0;
    let updatedCount = 0;
    const staleSupplerProductIds: string[] = [];

    if (toCreate.length > 0) {
      const newRows = toCreate.map(r => ({
        ...r.data,
        company_id: companyId,
        import_batch_id: batchId,
        updated_at: new Date().toISOString(),
      }));
      const { error: insErr } = await supabase.from("supplier_products").insert(newRows);
      if (insErr) return { data: null, error: errMsg(insErr) };
      createdCount = toCreate.length;
    }

    for (const row of toUpdate) {
      const spId = row.supplierProductId!;
      const priceChange = row.changes?.unit_price;
      const priceChanged = priceChange
        && priceChange.from !== null
        && priceChange.to !== null
        && Math.abs((priceChange.from as number) - (priceChange.to as number)) > 0.0001;

      const { error: updErr } = await supabase
        .from("supplier_products")
        .update({ ...row.data, import_batch_id: batchId, updated_at: new Date().toISOString() })
        .eq("id", spId)
        .eq("company_id", companyId);

      if (updErr) continue;
      updatedCount++;
      if (priceChanged) staleSupplerProductIds.push(spId);
    }

    if (staleSupplerProductIds.length > 0) {
      await supabase
        .from("catalogue_items")
        .update({ price_stale: true })
        .in("supplier_product_id", staleSupplerProductIds)
        .eq("company_id", companyId);
    }

    await supabase
      .from("supplier_import_batches")
      .update({ created_count: createdCount, updated_count: updatedCount })
      .eq("id", batchId);

    await logActivity(
      "supplier_import", batchId, "import",
      `Imported ${createdCount} new, ${updatedCount} updated from ${preview.supplierName}`,
      { supplier_name: preview.supplierName, created: createdCount, updated: updatedCount, stale_flagged: staleSupplerProductIds.length },
      preview.supplierName
    );

    return {
      data: { ...batch, created_count: createdCount, updated_count: updatedCount } as SupplierImportBatch,
      error: null,
    };
  } catch (e) {
    return { data: null, error: errMsg(e) };
  }
}

export async function listSupplierProducts(filters?: {
  supplierId?: string;
  category?: string;
  search?: string;
  activeOnly?: boolean;
}): Promise<DbResult<SupplierProduct[]>> {
  try {
    let q = supabase.from("supplier_products").select("*").order("supplier_name").order("product_name");
    if (filters?.supplierId) q = q.eq("supplier_id", filters.supplierId);
    if (filters?.category && filters.category !== "all") q = q.eq("category", filters.category);
    if (filters?.activeOnly) q = q.eq("active", true);
    if (filters?.search) q = q.ilike("product_name", `%${filters.search}%`);
    const { data, error } = await q;
    if (error) return { data: null, error: errMsg(error) };
    return { data: (data || []) as SupplierProduct[], error: null };
  } catch (e) {
    return { data: null, error: errMsg(e) };
  }
}

export async function listImportBatches(): Promise<DbResult<SupplierImportBatch[]>> {
  try {
    const { data, error } = await supabase
      .from("supplier_import_batches")
      .select("*")
      .order("imported_at", { ascending: false })
      .limit(50);
    if (error) return { data: null, error: errMsg(error) };
    return { data: (data || []) as SupplierImportBatch[], error: null };
  } catch (e) {
    return { data: null, error: errMsg(e) };
  }
}

/**
 * Activate a supplier product into the Active Library (catalogue_items).
 *
 * Returns { alreadyActive: true } when a catalogue_items row already links
 * to this supplier product — no duplicate is created.
 */
export async function activateToLibrary(
  supplierProductId: string,
  options: {
    sectionId: string;
    wasteFactor?: number;
    priceSource?: "supplier" | "account" | "manual";
    buyPrice?: number;
    manualRate?: number;
  }
): Promise<DbResult<{ catalogueItemId: string; alreadyActive: boolean }>> {
  try {
    const { companyId } = await getIdentity();
    if (!companyId) return { data: null, error: "Not signed in." };

    const { data: existing } = await supabase
      .from("catalogue_items")
      .select("id")
      .eq("company_id", companyId)
      .eq("supplier_product_id", supplierProductId)
      .maybeSingle();

    if (existing) {
      return { data: { catalogueItemId: existing.id, alreadyActive: true }, error: null };
    }

    const { data: sp, error: spErr } = await supabase
      .from("supplier_products")
      .select("*")
      .eq("id", supplierProductId)
      .eq("company_id", companyId)
      .single();

    if (spErr) return { data: null, error: errMsg(spErr) };

    const wf = options.wasteFactor ?? 1.0;
    const priceSource = options.priceSource ?? "supplier";
    const buyPrice = options.buyPrice ?? (sp.unit_price ?? null);

    let rate: number | null = null;
    if (priceSource === "manual" && options.manualRate != null) {
      rate = options.manualRate;
    } else if (buyPrice != null) {
      rate = computeEffectiveRate(sp.purchase_unit, buyPrice, wf, sp.sheet_length_mm, sp.sheet_width_mm);
    }

    const catalogueUnit = sp.purchase_unit === "sheet" ? "m2" : sp.purchase_unit;

    const { data: ci, error: ciErr } = await supabase
      .from("catalogue_items")
      .insert({
        company_id: companyId,
        section_id: options.sectionId,
        name: sp.product_name,
        unit: catalogueUnit,
        rate: rate ?? 0,
        supplier: sp.supplier_name,
        notes: sp.notes || null,
        attributes: {},
        sort_order: 0,
        sheet_length_mm: sp.sheet_length_mm || null,
        sheet_width_mm: sp.sheet_width_mm || null,
        supplier_product_id: supplierProductId,
        supplier_id: sp.supplier_id,
        sku: sp.sku || null,
        brand: sp.brand || null,
        thickness_mm: sp.thickness_mm || null,
        colour: sp.colour || null,
        finish: sp.finish || null,
        range: sp.range || null,
        material_type: sp.material_type || null,
        category: sp.category,
        subcategory: sp.subcategory || null,
        purchase_unit: sp.purchase_unit,
        pack_quantity: sp.pack_quantity,
        pack_price: sp.pack_price || null,
        buy_price: buyPrice,
        waste_factor: wf,
        price_source: priceSource,
        active: true,
        supplier_price_date: sp.supplier_price_date || null,
        price_stale: false,
        last_reviewed_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (ciErr) return { data: null, error: errMsg(ciErr) };

    await logActivity(
      "catalogue_item", ci.id, "activate",
      `Activated "${sp.product_name}" from ${sp.supplier_name} to Active Library`,
      { supplier_product_id: supplierProductId, section_id: options.sectionId, rate, price_source: priceSource },
      sp.product_name
    );

    return { data: { catalogueItemId: ci.id, alreadyActive: false }, error: null };
  } catch (e) {
    return { data: null, error: errMsg(e) };
  }
}

export type StaleReviewAction = "accept_supplier" | "keep_existing" | "update_buy_price";

/**
 * Handle a stale price review for an Active Library item.
 *
 * accept_supplier:   recompute rate from current supplier product price.
 *                    Valid only for price_source='supplier'. Never touches
 *                    account or manual items.
 * keep_existing:     clear stale flag only — rate and buy_price unchanged.
 * update_buy_price:  set new buy_price (account/negotiated), recompute rate,
 *                    optionally change price_source.
 */
export async function reviewStaleItem(
  catalogueItemId: string,
  action: StaleReviewAction,
  options?: {
    newBuyPrice?: number;
    newWasteFactor?: number;
    newPriceSource?: "supplier" | "account" | "manual";
    newRate?: number;
  }
): Promise<DbResult<{ rate: number | null }>> {
  try {
    const { companyId } = await getIdentity();
    if (!companyId) return { data: null, error: "Not signed in." };

    const { data: ci, error: ciErr } = await supabase
      .from("catalogue_items")
      .select("*")
      .eq("id", catalogueItemId)
      .eq("company_id", companyId)
      .single();

    if (ciErr) return { data: null, error: errMsg(ciErr) };

    const now = new Date().toISOString();
    let patch: Record<string, any> = { price_stale: false, last_reviewed_at: now };
    let finalRate: number | null = ci.rate;

    if (action === "accept_supplier") {
      if (!ci.supplier_product_id)
        return { data: null, error: "No linked supplier product." };

      const { data: sp, error: spErr } = await supabase
        .from("supplier_products")
        .select("unit_price,pack_price,pack_quantity,purchase_unit,sheet_length_mm,sheet_width_mm,supplier_price_date")
        .eq("id", ci.supplier_product_id)
        .single();

      if (spErr) return { data: null, error: errMsg(spErr) };

      const wf = ci.waste_factor ?? 1.0;
      const newRate = computeEffectiveRate(
        ci.purchase_unit ?? sp.purchase_unit,
        sp.unit_price ?? 0,
        wf,
        sp.sheet_length_mm,
        sp.sheet_width_mm
      );

      patch = {
        ...patch,
        buy_price: sp.unit_price,
        pack_price: sp.pack_price,
        rate: newRate ?? ci.rate,
        price_source: "supplier",
        supplier_price_date: sp.supplier_price_date,
      };
      finalRate = newRate;

    } else if (action === "update_buy_price") {
      const newBuyPrice = options?.newBuyPrice ?? ci.buy_price;
      const newWf = options?.newWasteFactor ?? ci.waste_factor ?? 1.0;
      const newSrc = options?.newPriceSource ?? ci.price_source ?? "manual";

      let newRate: number | null;
      if (newSrc === "manual" && options?.newRate != null) {
        newRate = options.newRate;
      } else if (newBuyPrice != null) {
        newRate = computeEffectiveRate(ci.purchase_unit ?? "each", newBuyPrice, newWf, ci.sheet_length_mm, ci.sheet_width_mm);
      } else {
        newRate = null;
      }

      patch = {
        ...patch,
        buy_price: newBuyPrice,
        waste_factor: newWf,
        rate: newRate ?? ci.rate,
        price_source: newSrc,
      };
      finalRate = newRate;
    }
    // keep_existing: patch already has only price_stale=false + last_reviewed_at

    const { error: updErr } = await supabase
      .from("catalogue_items")
      .update(patch)
      .eq("id", catalogueItemId)
      .eq("company_id", companyId);

    if (updErr) return { data: null, error: errMsg(updErr) };

    await logActivity(
      "catalogue_item", catalogueItemId, `review_stale_${action}`,
      `Price review (${action}) for "${ci.name}"`,
      { action, new_rate: finalRate },
      ci.name
    );

    return { data: { rate: finalRate }, error: null };
  } catch (e) {
    return { data: null, error: errMsg(e) };
  }
}
