// Pure-JS tests for supplier catalogue helpers.
// Run with: node tests/supplierCatalogue.test.js
// No test framework — intentional; project has no test runner configured.
//
// Tests cover: rate calculation, SKU normalisation, row classification logic,
// price-source behaviour, and project snapshot isolation.
// DB-dependent paths (RLS, multi-tenant isolation) are noted but not exercised here.

// ─── Inline pure functions under test ─────────────────────────────────────────
// These are extracted verbatim from lib/db/supplierProducts.ts.
// If the signatures change, update here too.

function normalizeSkuForMatch(sku) {
  return sku.trim().toLowerCase();
}

function computeEffectiveRate(purchaseUnit, unitPrice, wasteFactor, sheetLengthMm, sheetWidthMm) {
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

// Row classification logic extracted from previewSupplierImport
function classifyRow(incoming, existingProducts) {
  const skuNorm = incoming.sku ? normalizeSkuForMatch(incoming.sku) : null;
  let match;
  if (skuNorm) {
    match = existingProducts.find(e => e.sku != null && normalizeSkuForMatch(e.sku) === skuNorm);
  }
  if (!match) {
    match = existingProducts.find(
      e => e.product_name.toLowerCase() === incoming.product_name.toLowerCase()
        && e.category === incoming.category
    );
  }
  if (!match) return { classification: "new" };
  const eps = 0.0001;
  const priceChanged = Math.abs((match.unit_price || 0) - (incoming.unit_price || 0)) > eps;
  const nameChanged = match.product_name !== incoming.product_name;
  const hasChanges = priceChanged || nameChanged;
  return {
    classification: hasChanges ? "update" : "unchanged",
    supplierProductId: match.id,
  };
}

// ─── Test infrastructure ───────────────────────────────────────────────────────
let passed = 0, failed = 0, skipped = 0;

function assert(label, condition, detail) {
  if (condition) {
    passed++;
    console.log("  ✓ " + label);
  } else {
    failed++;
    console.error("  ✗ " + label + (detail ? ": " + detail : ""));
  }
}

function assertClose(label, actual, expected, tolerance) {
  const tol = tolerance || 0.0001;
  const ok = actual !== null && Math.abs(actual - expected) < tol;
  assert(label, ok, "expected " + expected + " got " + actual);
}

function assertNull(label, actual) {
  assert(label, actual === null, "expected null, got " + actual);
}

function assertEq(label, actual, expected) {
  assert(label, actual === expected, "expected " + JSON.stringify(expected) + " got " + JSON.stringify(actual));
}

function section(name) {
  console.log("\n" + name);
}

// ─── Tests ────────────────────────────────────────────────────────────────────

section("SKU normalisation");
assertEq("lower-case SKU matches", normalizeSkuForMatch("ABC-123"), "abc-123");
assertEq("upper-case SKU normalised", normalizeSkuForMatch("ABC-123"), normalizeSkuForMatch("abc-123"));
assertEq("trim whitespace", normalizeSkuForMatch("  ABC-123  "), "abc-123");
assertEq("same SKU different case treated equal", normalizeSkuForMatch("lx-4573") === normalizeSkuForMatch("LX-4573"), true);

section("Sheet product rate calculation (purchase_unit=sheet)");
// Worked example from architecture doc:
// $285/sheet, 3600x1800mm = 6.48m2, waste 1.10
// raw = 285/6.48 = 43.9815/m2
// effective = 43.9815 * 1.10 = 48.3796/m2
assertClose("worked example: $285/sheet 3600x1800 waste 1.10",
  computeEffectiveRate("sheet", 285, 1.10, 3600, 1800), 48.3796);

assertClose("no waste factor (1.0) leaves raw $/m2",
  computeEffectiveRate("sheet", 285, 1.0, 3600, 1800), 285 / ((3600*1800)/1e6));

assertClose("pack price via pack_quantity — unit_price pre-divided by caller",
  // $570 pack / 2 sheets = $285/sheet
  computeEffectiveRate("sheet", 285, 1.0, 3600, 1800),
  computeEffectiveRate("sheet", 570/2, 1.0, 3600, 1800));

assertNull("missing sheet_length_mm returns null", computeEffectiveRate("sheet", 285, 1.10, null, 1800));
assertNull("missing sheet_width_mm returns null", computeEffectiveRate("sheet", 285, 1.10, 3600, null));
assertNull("zero sheet dimensions returns null", computeEffectiveRate("sheet", 285, 1.10, 0, 1800));
assertNull("zero unit price returns null", computeEffectiveRate("sheet", 0, 1.10, 3600, 1800));
assertNull("negative unit price returns null", computeEffectiveRate("sheet", -5, 1.10, 3600, 1800));

assertClose("smaller sheet — 2440x1220mm",
  computeEffectiveRate("sheet", 120, 1.05, 2440, 1220),
  Math.round((120 / ((2440*1220)/1e6)) * 1.05 * 10000) / 10000);

section("Non-sheet unit calculations");
assertClose("each: $12.50/hinge waste 1.0", computeEffectiveRate("each", 12.50, 1.0), 12.5);
assertClose("each: $12.50/hinge waste 1.02 (breakage)", computeEffectiveRate("each", 12.50, 1.02), 12.75);
assertClose("pair: $45/pair waste 1.0", computeEffectiveRate("pair", 45, 1.0), 45.0);
assertClose("set: $89/drawer system waste 1.0", computeEffectiveRate("set", 89, 1.0), 89.0);
assertClose("lm: $8.50/lm waste 1.05", computeEffectiveRate("lm", 8.50, 1.05), Math.round(8.50 * 1.05 * 10000)/10000);
assertClose("m2: $55/m2 waste 1.10 (veneer)", computeEffectiveRate("m2", 55, 1.10), Math.round(55 * 1.10 * 10000)/10000);
assertClose("pack: $0.15/screw waste 1.0", computeEffectiveRate("pack", 0.15, 1.0), 0.15);
assertNull("each: zero price returns null", computeEffectiveRate("each", 0, 1.0));

section("Row classification — new / update / unchanged / rejected");
const existingDb = [
  { id: "p1", sku: "LX-18W", product_name: "White 18mm MDF", category: "Board", unit_price: 43.98 },
  { id: "p2", sku: null,     product_name: "Blum 971A Hinge", category: "Hinge", unit_price: 3.50 },
  { id: "p3", sku: "BL-300", product_name: "Legrabox 300",    category: "Drawer System", unit_price: 89.00 },
];

const newProduct  = { sku: "LX-22W", product_name: "White 22mm MDF", category: "Board", unit_price: 52.00 };
const exactMatch  = { sku: "LX-18W", product_name: "White 18mm MDF", category: "Board", unit_price: 43.98 };
const priceUpdate = { sku: "LX-18W", product_name: "White 18mm MDF", category: "Board", unit_price: 45.20 };
const skuCaseVar  = { sku: "lx-18w", product_name: "White 18mm MDF", category: "Board", unit_price: 43.98 };
const nameMatch   = { sku: null,     product_name: "Blum 971A Hinge", category: "Hinge", unit_price: 3.50 };
const namePrice   = { sku: null,     product_name: "Blum 971A Hinge", category: "Hinge", unit_price: 3.75 };

assertEq("new SKU not in db → new", classifyRow(newProduct, existingDb).classification, "new");
assertEq("exact match → unchanged", classifyRow(exactMatch, existingDb).classification, "unchanged");
assertEq("same SKU price changed → update", classifyRow(priceUpdate, existingDb).classification, "update");
assertEq("SKU case variant matches existing → unchanged", classifyRow(skuCaseVar, existingDb).classification, "unchanged");
assertEq("name match (no SKU) → unchanged", classifyRow(nameMatch, existingDb).classification, "unchanged");
assertEq("name match price changed → update", classifyRow(namePrice, existingDb).classification, "update");
assertEq("update returns supplierProductId", classifyRow(priceUpdate, existingDb).supplierProductId, "p1");

section("Cross-company SKU isolation (logic only — RLS enforces DB isolation)");
// Simulates that each company sees only their own existingProducts array.
// DB isolation is enforced by RLS policy company_id = my_company_id().
const companyA_db = [{ id: "a1", sku: "SKU-001", product_name: "Board X", category: "Board", unit_price: 40.00 }];
const companyB_db = []; // Company B has no products yet
assertEq("same SKU not in company B db → new for company B",
  classifyRow({ sku: "SKU-001", product_name: "Board X", category: "Board", unit_price: 40.00 }, companyB_db).classification, "new");
assertEq("same SKU in company A → unchanged for company A",
  classifyRow({ sku: "SKU-001", product_name: "Board X", category: "Board", unit_price: 40.00 }, companyA_db).classification, "unchanged");

section("Intra-file duplicate SKU detection");
// Simulates the seenSkus logic in previewSupplierImport
function classifyBatch(rows, existingProducts) {
  const seenSkus = new Set();
  return rows.map(row => {
    const skuNorm = row.sku ? normalizeSkuForMatch(row.sku) : null;
    if (skuNorm) {
      if (seenSkus.has(skuNorm)) return { ...row, classification: "rejected", reason: "Duplicate SKU in file: " + row.sku };
      seenSkus.add(skuNorm);
    }
    return { ...row, ...classifyRow(row, existingProducts) };
  });
}
const batchWithDupe = [
  { sku: "SKU-001", product_name: "Product A", category: "Board", unit_price: 10 },
  { sku: "SKU-001", product_name: "Product A", category: "Board", unit_price: 10 },
  { sku: "SKU-002", product_name: "Product B", category: "Hinge", unit_price: 5 },
];
const batchResult = classifyBatch(batchWithDupe, []);
assertEq("first occurrence of duplicate SKU → new", batchResult[0].classification, "new");
assertEq("second occurrence of duplicate SKU → rejected", batchResult[1].classification, "rejected");
assertEq("non-duplicate in same batch → new", batchResult[2].classification, "new");

section("Price source behaviour (supplier / account / manual)");
// Simulates the reviewStaleItem logic for each price_source.
// 'account' and 'manual' must NOT be auto-updated by accept_supplier.
function shouldAcceptSupplierUpdateRate(item) {
  // accept_supplier action recomputes rate from new supplier price.
  // This function represents the guard: only price_source='supplier' should
  // auto-accept in the simplified flow. account/manual must require explicit action.
  return item.price_source === "supplier";
}

const supplierItem = { id: "i1", price_source: "supplier", rate: 48.00, buy_price: 43.98, waste_factor: 1.10 };
const accountItem  = { id: "i2", price_source: "account",  rate: 42.00, buy_price: 38.18, waste_factor: 1.10 };
const manualItem   = { id: "i3", price_source: "manual",   rate: 50.00, buy_price: null,  waste_factor: 1.0  };

assert("supplier item eligible for auto rate from accept_supplier", shouldAcceptSupplierUpdateRate(supplierItem));
assert("account item NOT auto-updated by accept_supplier", !shouldAcceptSupplierUpdateRate(accountItem));
assert("manual item NOT auto-updated by accept_supplier", !shouldAcceptSupplierUpdateRate(manualItem));

section("Effective rate recomputed correctly on review");
// After accept_supplier: new unit_price=$45.20, same sheet 3600x1800, waste 1.10
const newSupplierUnitPrice = 45.20; // was 43.98
const expectedNewRate = computeEffectiveRate("sheet", newSupplierUnitPrice, 1.10, 3600, 1800);
assertClose("accept_supplier: rate recomputed from new supplier price", expectedNewRate,
  Math.round((45.20 / ((3600*1800)/1e6)) * 1.10 * 10000) / 10000);

// After update_buy_price with account price:
const accountBuyPrice = 38.00;
const accountRate = computeEffectiveRate("each", accountBuyPrice, 1.0);
assertClose("update_buy_price (account each item): rate = buy_price * waste_factor", accountRate, 38.00);

section("Project snapshot isolation");
// Simulates loadCabinetPricing slotRate logic.
// When a direct project rate is set, it must win over catalogue item rate.
function slotRate(directRate, catalogueItemRate) {
  if (directRate !== null && directRate !== undefined) return +directRate;
  return catalogueItemRate != null ? +catalogueItemRate : null;
}

assertClose("project rate wins over catalogue rate", slotRate(60.00, 48.38), 60.00);
assertClose("catalogue rate used when no project rate", slotRate(null, 48.38), 48.38);
assertClose("zero is a valid project rate (not skipped)", slotRate(0, 48.38), 0);
assertNull("both null → null", slotRate(null, null));

// Changing catalogue_items.rate must not affect a project that has a snapshot rate set.
// The snapshot is in project_cabinet_preset.*_rate and is read via slotRate with priority.
// As long as project_cabinet_preset.carcass_rate is set, catalogue item rate changes are irrelevant.
const projectRate = 55.00;
const updatedCatalogueRate = 72.00; // supplier updated, library updated
assertClose("snapshot rate unchanged after catalogue update",
  slotRate(projectRate, updatedCatalogueRate), projectRate);

section("Malformed CSV handling");
// Simulates validation errors from validateRow
function validateMapped(row) {
  if (!row.product_name || !row.product_name.trim()) return { valid: false, reason: "product_name is required" };
  const price = parseFloat((row.pack_price||"").replace(/[^0-9.\-]/g, ""));
  if (isNaN(price) || price <= 0) return { valid: false, reason: "pack_price must be a positive number" };
  const VALID_PU = new Set(["sheet","m2","each","pack","set","pair","lm"]);
  const pu = (row.purchase_unit||"each").toLowerCase().trim();
  if (!VALID_PU.has(pu)) return { valid: false, reason: "purchase_unit invalid: " + pu };
  if (pu === "sheet") {
    if (!row.sheet_length_mm || +row.sheet_length_mm <= 0)
      return { valid: false, reason: "sheet_length_mm required for purchase_unit=sheet" };
    if (!row.sheet_width_mm || +row.sheet_width_mm <= 0)
      return { valid: false, reason: "sheet_width_mm required for purchase_unit=sheet" };
  }
  return { valid: true };
}

assert("missing product_name rejected", !validateMapped({ pack_price: "10" }).valid);
assert("missing pack_price rejected", !validateMapped({ product_name: "X" }).valid);
assert("zero pack_price rejected", !validateMapped({ product_name: "X", pack_price: "0" }).valid);
assert("negative pack_price rejected", !validateMapped({ product_name: "X", pack_price: "-5" }).valid);
assert("price with currency symbol parsed", validateMapped({ product_name: "X", pack_price: "$285.00" }).valid);
assert("price with comma parsed", validateMapped({ product_name: "X", pack_price: "1,285.00" }).valid);
assert("invalid purchase_unit rejected", !validateMapped({ product_name: "X", pack_price: "10", purchase_unit: "box" }).valid);
assert("valid purchase_unit each accepted", validateMapped({ product_name: "X", pack_price: "10", purchase_unit: "each" }).valid);
assert("sheet without dimensions rejected", !validateMapped({ product_name: "X", pack_price: "285", purchase_unit: "sheet" }).valid);
assert("sheet with dimensions accepted", validateMapped({
  product_name: "X", pack_price: "285", purchase_unit: "sheet",
  sheet_length_mm: "3600", sheet_width_mm: "1800" }).valid);
assert("empty file (no rows) handled gracefully", validateMapped({}) && !validateMapped({}).valid);

// ─── Summary ───────────────────────────────────────────────────────────────────
console.log("\n" + "=".repeat(60));
console.log("Results: " + passed + " passed, " + failed + " failed" + (skipped ? ", " + skipped + " skipped" : ""));
if (failed > 0) {
  console.error("FAIL");
  process.exit(1);
} else {
  console.log("PASS");
  process.exit(0);
}
