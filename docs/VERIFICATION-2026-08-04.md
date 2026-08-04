# Verixo — Verification Report
**Date:** 2026-08-04
**Scope:** V1–V15 per specification
**Method:** Static code analysis — ConstructionHub.jsx, lib/db/*, supabase/migrations/*, app/api/ai/route.ts
**Status:** READ-ONLY. No application code was modified.

---

## V1 — Takeoff/Estimate Parity [INV-1]

```
VERDICT: BROKEN
EVIDENCE:
  lib/db/takeoffs.ts:61–108   saveTakeoff() — DELETE + re-insert, no estimate sync
  lib/db/estimates.ts:118–146 addItems() — bulk insert from takeoff via push
  ConstructionHub.jsx:4519–4637 pushToEstimate() — the only sync path; manual, one-way
  ConstructionHub.jsx:456–470 calc() — reads only proj.lineItems (estimate side)
HOW VERIFIED: Traced both tables end-to-end. takeoff_items and estimate_items are separate
  tables with no FK or trigger linking them. The only bridge is pushToEstimate(), which is
  manual and one-directional.
GAPS:
  - Quantities are STORED SEPARATELY in both takeoff_items and estimate_items.
    After push, if the operator edits the takeoff (adds/removes/adjusts items), the
    estimate is NOT updated. Divergence is permanent and silent.
  - saveTakeoff() (called on re-import) DELETEs the takeoff record and reinserts —
    but never touches estimate_items. A re-run of AI Extract silently orphans the
    previously-pushed estimate lines.
  - pushToEstimate() does not clear prior takeoff-sourced estimate lines before adding
    new ones; duplicate lines if called twice.
  - There is no DB trigger, no foreign-key cascade, and no derived-at-read-time join.
INV-1 does NOT hold. Divergence between takeoff and estimate is structurally inevitable
once pushToEstimate() has run and either table is subsequently modified.
NOTES: The fix is schema-level: a confirmed_takeoff_item_id FK on estimate_items, or a
  "live-link" view that derives estimate lines from takeoff_items. Currently neither exists.
```

---

## V2 — AI Confirmation Gate and Confidence [INV-2]

```
VERDICT: PARTIAL
EVIDENCE:
  supabase/migrations/20260720000001_cabinets.sql:54–55  ai_draft boolean, ai_confidence integer
  lib/db/cabinets.ts:16–18   listCabinets() filters WHERE ai_draft = false
  lib/db/cabinets.ts:26–38   listDraftCabinets() WHERE ai_draft = true
  ConstructionHub.jsx:3675–3677  hardcoded ai_confidence: 70 for all AI draft cabinets
  ConstructionHub.jsx:6005–6006  Estimate cabinet summary: approved = cabinets.filter(!ai_draft)
  ConstructionHub.jsx:4519–4637  pushToEstimate() — no confidence filter; all takeoff items included
HOW VERIFIED: Traced the two divergent paths: (a) cabinet database → estimate summary, and
  (b) takeoff items → estimate via pushToEstimate(). Path (a) gates on ai_draft. Path (b)
  has no gate at all.
GAPS:
  - The CABINET DATABASE path correctly excludes ai_draft=true rows (confidence gate works).
  - The TAKEOFF → ESTIMATE path has NO confidence or draft gate. Any item in takeoff_items
    — regardless of the AI's confidence — is included in pushToEstimate() and can reach the
    quote total. This is a yes: unconfirmed/low-confidence items CAN reach the quote.
  - ai_confidence is hardcoded to 70 for all AI draft cabinets (line 3677), regardless of
    the per-batch confidence the AI actually reported. The per-batch confidence ("high" /
    "medium" / "low") from the AI response is stored in takeoff.ai_summary but NOT
    propagated to individual cabinet rows.
  - Confidence IS surfaced in the DraftReviewBanner component and per-row ConfidenceBadge
    in CabinetDatabase.jsx — visible at the point where the operator reviews drafts.
NOTES: INV-2 partially holds for the cabinet database path. It fails for the
  takeoff → estimate direct push path.
```

---

## V3 — Live Revision Diff and Variation Costing [INV-3]

```
VERDICT: MISSING
EVIDENCE:
  lib/db/takeoffs.ts:61–108  saveTakeoff() — DELETE existing record, reinsert
  lib/db/takeoffs.ts:36–58   getTakeoff() — reads single takeoff per project (maybeSingle)
  lib/db/variations.ts       Variations exist as separate scope-change entities (not revisions)
HOW VERIFIED: saveTakeoff() explicitly deletes the row for the project before reinserting.
  There is one takeoff record per project, not a versioned append. Searched for diff engine,
  revision_history, drawing_versions, cost_delta — none found.
GAPS:
  - Drawing revisions overwrite: re-importing a PDF wipes the previous takeoff completely.
    There is no previous/current snapshot pair to diff against.
  - No diff engine of any kind. No comparison of item-level changes.
  - No live cost-delta (what did this revision add/remove?). Variations are separate
    entities (contract changes, not drawing revisions).
  - Variation costing exists (variations.ts) but is for post-contract scope changes,
    not drawing revision deltas.
MINIMAL DATA MODEL CHANGE (no implementation):
  Add a version_number integer and superseded_at timestamptz to takeoffs. Remove the
  DELETE step from saveTakeoff(); instead insert a new row with version_number + 1.
  Add a takeoff_diff view: LEFT JOIN current items to previous items on (label, layer_id),
  exposing added/removed/changed rows with rate delta per item.
```

---

## V4 — Grouping per Unit / Item Type / Level [INV-4]

```
VERDICT: CONFIRMED
EVIDENCE:
  supabase/migrations/20260720000001_cabinets.sql:14–16  level, unit_type, joinery_type columns
  supabase/migrations/20260726000001_cabinets_qty.sql    qty column (1 per row for existing, n for AI batch)
  lib/db/cabinets.ts:167–183  getCabinetSummaryByGroup() — groups at read time
  ConstructionHub.jsx:5936–5962  buildEstGroups() — computes groupings from lineItems in memory
  ConstructionHub.jsx:4247–4253  Each takeoff item carries cab.unit, cab.room, cab.type, cab.level
HOW VERIFIED: Traced the schema columns and both grouping functions. Grouping is computed
  at read/view time; no row-per-group duplication.
NOTES: Unit-type-with-quantity: cabinets.qty column (migration 20260726000001) stores the
  count for AI draft rows ("3× Base Cabinet 600mm"), avoiding N identical rows. Approved
  manual cabinets default to qty=1. The estimate grouping (buildEstGroups) supports views
  by category, joinery type, unit, and level.
```

---

## V5 — Tenant Isolation [INV-5] — HIGHEST SEVERITY

```
VERDICT: PARTIAL
EVIDENCE:
  supabase/migrations/20260720000001_cabinets.sql:74–81  cabinets — RLS enabled, company_id IN (SELECT company_id FROM profiles...)
  supabase/migrations/20260720000003_company_entitlements.sql:39–45  company_entitlements — RLS enabled, SELECT only
  supabase/migrations/20260720000004_ai_usage_logs.sql:27–33  ai_usage_logs — RLS enabled, SELECT only
  ConstructionHubDocs/HANDOFF.md:21–33  "SECURITY-RESET (RLS + my_company_id() SECURITY DEFINER helper)",
    "PHASE 1 (clients, estimates, estimate_items + RLS)" — applied directly in Supabase SQL Editor
  lib/db/_base.ts:15–34  getIdentity() — derives company_id from session, never browser
  lib/db/projects.ts:6  "Reads rely on RLS to return only the company's rows"
  app/api/ai/route.ts:22–39  adminClient() uses service role for consume_credits RPC only
HOW VERIFIED: Read all 7 migration files in the repo. Checked HANDOFF.md for pre-repo
  migrations. Traced identity resolution and supabase client setup.
GAPS:
  CONFIRMABLE (in-repo migrations):
    - cabinets: RLS ENABLED, policy correctly scopes to company_id ✓
    - company_entitlements: RLS ENABLED, SELECT-only via company_id ✓
    - ai_usage_logs: RLS ENABLED, SELECT-only via company_id ✓
    - No USING(true) policies in any repo migration ✓
  UNVERIFIABLE (applied directly in Supabase SQL Editor, not in this repo):
    - projects, estimates, estimate_items, takeoffs, takeoff_items
    - variations, quote_versions, quote_version_items
    - activity_logs, clients, builders, suppliers, rates
    - catalogue_sections, catalogue_items, cabinet_formula, project_cabinet_preset
    - profiles, companies
    Per HANDOFF.md, SECURITY-RESET and PHASE 1 migrations applied RLS to most of these.
    Cannot verify policy correctness without reading the live Supabase schema.
  FLAGS:
    - app/api/ai/route.ts:200–210: adminClient() (service role) is used to call the
      legacy consume_credits RPC. If that RPC reads or writes data without a company
      scope guard, it bypasses RLS. The call is non-fatal (wrapped in try/catch) and
      the RPC "may not exist yet" per the comment. Low blast radius: usage metering only.
    - Client-side: supabase.ts uses anon key (correct). No service-role key in browser.
    - Auth gate: AuthGate.tsx wraps all routes; the app is a SPA so all paths require login.
    - Company settings writes: Settings module writes company columns including default_margin,
      default_overhead, default_gst — policy on companies table not verifiable from repo.
RANK BY BLAST RADIUS:
  1. Unverifiable tables (projects, estimates) — if RLS is misconfigured, tenant A could
     read tenant B's pricing. Must be verified in Supabase Dashboard.
  2. adminClient service-role for consume_credits — currently non-fatal and data-scoped, but
     any future RPC called via adminClient that touches project/estimate data would be
     unscoped.
```

---

## V6 — Per-Line Finish Override

```
VERDICT: PARTIAL
EVIDENCE:
  supabase/migrations/20260720000001_cabinets.sql:29–30  material text, door_style text (no finish_id FK)
  ConstructionHub.jsx:297  priceCabLine() uses line.finishId from cab object
  ConstructionHub.jsx:4246–4253  AI takeoff puts finishes into cab.finishes JSONB per item
  ConstructionHub.jsx:4054  "CABINET FINISH TAGS: capture in that cabinet's 'finish' field"
HOW VERIFIED: Read cabinets schema and priceCabLine() function. Searched for finish_id column
  in migrations.
GAPS:
  - The cabinets TABLE has material (text) and door_style (text) but no finish_id FK column.
    The per-cabinet pricing fields (unit_cost, sell_price) are stored scalars that the
    operator sets directly — there is no formula-driven finish selection per cabinet row.
  - Per-line finish IS supported on the TAKEOFF → ESTIMATE path: the cab JSONB field on
    takeoff_items can carry a finishId, and priceCabLine() uses it. So AI-detected finish
    per cabinet line does drive the pricing calculation at push time.
  - After push, the finish identity is lost: estimate_items.rate is a stored number; there
    is no finish_id column on estimate_items to re-price if the finish library changes.
SCHEMA CHANGE IF NEEDED FOR FULL SUPPORT:
  Add finish_id integer to cabinets (FK to a finishes lookup). Add finish_id to
  estimate_items (or store finish_name text for snapshot purposes). Affected components:
  CabinetDatabase.jsx (cabinet form), priceCabLine() (already reads finishId), EstimateModule
  (re-price button would need to read finish_id per line).
```

---

## V7 — Persistence in Supabase

```
VERDICT: PARTIAL
EVIDENCE:
  ConstructionHub.jsx:47–70  useLS() hook — reads/writes localStorage, cross-tab sync
  ConstructionHub.jsx:852–855  rates, cabLib, company, xero state via useLS
  ConstructionHub.jsx:1058–1087  cabLib and rates: load from Supabase, seed back if empty
  ConstructionHub.jsx:1112–1124  cabLib auto-saves to companies.cab_library debounced 1500ms
  ConstructionHub.jsx:12083–12108  Settings "Save All Settings" writes company fields to Supabase
  ConstructionHub.jsx:5760–5770  estimate templates sync to companies.est_templates
  ConstructionHubDocs/HANDOFF.md:17–19  explicit list of localStorage-only entities
HOW VERIFIED: Traced every useLS() call, read the HANDOFF.md migration inventory, verified
  auto-save paths for each entity.
GAPS:
  CONFIRMED SUPABASE-BACKED (fully migrated or synced):
    - projects, clients, builders, suppliers: Supabase-primary ✓
    - estimates + estimate_items: Supabase-primary ✓
    - cabLib (companies.cab_library): auto-saves debounced ✓
    - company settings: writes to Supabase on explicit save ✓
    - estimate templates (companies.est_templates): debounced auto-save ✓
    - rates: seeded to Supabase rates table on first run; reads from Supabase if populated ✓
  STILL IN LOCALSTORAGE (no Supabase write path):
    - qf_xero: Xero config (connected, taxCode, accountCode, log) — localStorage only.
      Not a live integration (Xero is simulated), so low risk, but settings would be lost
      on browser clear or cross-device use.
    - qf_ai: AI endpoint config (mode, endpoint, apiKey) — localStorage only. If a user
      sets a direct apiKey in localStorage, it is visible in DevTools and persists across
      sessions. Risk: accidental API key exposure.
    - qf_theme: theme preferences — localStorage only. Cosmetic only, low risk.
  ENTITY WITH READ/WRITE DISAGREEMENT:
    - company state uses useLS("qf_company", SEED_COMPANY) which writes to localStorage on
      every state change, but Supabase is only updated on explicit "Save All Settings". If
      the user edits a field, navigates away without saving, and another browser tab reads
      from Supabase, it sees stale data. The localStorage version diverges from Supabase
      until explicit save.
  NO ZUSTAND: No Zustand stores found. All state is React useState / useLS.
NOTES: HANDOFF.md §3 rule is clear: "every new persisted feature goes through /lib/db/*.
  Never build a new feature on useLS." The remaining useLS entities are acknowledged legacy.
```

---

## V8 — Audit Trail

```
VERDICT: PARTIAL
EVIDENCE:
  lib/db/_base.ts:49–71  logActivity() — inserts to activity_logs, never throws
  lib/db/estimates.ts:82–87, 140–142  logActivity on updateEstimate and addItems
  lib/db/projects.ts:46, 88, 103, 116  logActivity on create/trash/restore/delete
  lib/db/variations.ts:67, 91, 102  logActivity on variation CRUD
  lib/db/quotes.ts:171, 193  logActivity on quote version create/update
  ConstructionHub.jsx:2438–2442  Activity feed renders: icon + summary text + time (no "who")
HOW VERIFIED: Grep'd all logActivity() call sites, read the activity_logs schema, traced the
  dashboard feed renderer.
GAPS:
  WRITE PATHS WITH AUDIT (logged):
    - Project: create, trash, restore, hard-delete ✓
    - Estimate: settings update, bulk item add ✓
    - Variation: create, update, delete ✓
    - Quote version: create, status transitions ✓
    - Client: check lib/db/clients.ts — not read in full, likely logged given pattern
  WRITE PATHS WITHOUT AUDIT (no logActivity call):
    - Individual estimate line item updates (updateItem, deleteItem) — lib/db/estimates.ts
      updateItem() and deleteItem() have no logActivity calls
    - Cabinet creates/updates/deletes — lib/db/cabinets.ts has no logActivity calls
    - Takeoff saves and item adds/deletes — lib/db/takeoffs.ts has no logActivity calls
    - Scheme saves, board overrides — lib/db/schemes.ts (not fully read but pattern suggests absent)
    - Production cell updates — lib/db/production.ts
  WHAT IS CAPTURED per entry:
    entity_type, entity_id, action (verb like "create"/"update"/"delete"), summary (short text),
    user_id, company_id, created_at. meta is always {} (empty object) in all call sites found.
  WHAT IS NOT RENDERED:
    user_id is stored but NOT displayed in the activity feed. The feed shows only
    icon + summary + time. There is no "who" in the UI output.
  UPDATE/DELETE ON activity_logs:
    No UPDATE or DELETE against activity_logs found in any lib/db/ file or component. ✓
  WHAT COULD BE CAPTURED WITH NO MIGRATION:
    - "who": join user_id to profiles.full_name — no migration needed
    - "to what by name": requires caching entity_name at log time (text field on activity_logs)
      or a join, which is migration-free if done via views
    - Per-field change tracking: would require populating the meta JSONB field (currently {})
      with {from: oldValue, to: newValue} — no schema change, just code change
```

---

## V9 — File Ingestion

```
VERDICT: PARTIAL
EVIDENCE:
  ConstructionHub.jsx:3843  handleFile() — rejects non-PDF: file.type !== "application/pdf"
  ConstructionHub.jsx:4685  input accept=".pdf" only
  ConstructionHub.jsx:3808–3816  PDF.js loaded from CDN (v3.11.174)
  ConstructionHub.jsx:3830–3838  rasterise() — renders page to JPEG via canvas
  ConstructionHub.jsx:3985–3986  scan at 55 DPI, batches of 8 pages
  ConstructionHub.jsx:4067–4068  EXTRACT_DPI=190 (cabinetry) / 175 (general), MAX_TOK=8000/2500
  app/api/ai/route.ts:16,17    runtime=nodejs, maxDuration=120 seconds
HOW VERIFIED: Read handleFile(), rasterise(), runExtract() end-to-end.
GAPS:
  - DWG and DXF: no handling at all. The file input accepts only .pdf; DWG/DXF rejected silently.
  - Vector vs raster PDF detection: none. All PDFs are rasterized regardless of whether they
    contain searchable vector text. A native-text PDF loses all its structured data and goes
    through the same image-recognition pipeline as a scanned set.
  - 28-page A3 set risks:
    * SCAN phase: 4 batches of 8 pages, each rasterized at 55 DPI, sent to AI. 55 DPI on
      A3 (420×297mm) = ~900×640px per page. 8 pages = ~8 JPEG images per API call. Manageable.
    * EXTRACT phase: batches of 4 pages at 190 DPI. A3 at 190 DPI ≈ 3130×2215px per page.
      4 pages = 4 large JPEG images. Each batch sent in one API call with up to 8000 tokens
      output. The API route has maxDuration=120s — tight for 7 extraction batches × 4 pages.
    * No explicit file size cap in handleFile(). The 28MB limit is implicitly the browser's
      memory capacity for ArrayBuffer + multiple canvas elements.
    * Thumbnail generation: limited to 24 pages (line 3856: lim=Math.min(n,24)). Pages 25+
      show no thumbnail but ARE processed in extraction.
  - No page count hard cap on extraction. A 200-page set would attempt hundreds of API calls
    and almost certainly hit the 120s server timeout or Anthropic rate limits.
NOTES: The circuit-breaker (3 consecutive extraction failures abort) provides some protection.
```

---

## V10 — Pricing Engine Correctness

```
VERDICT: BROKEN
EVIDENCE:
  ConstructionHub.jsx:282–342  priceCabLine() — supply cost chain
  ConstructionHub.jsx:456–471  calc() — estimate/dashboard total
  ConstructionHub.jsx:6265–6272  QuoteDocument — quote display total
  lib/db/quotes.ts:107–114   issueQuote() — locked quote total
  ConstructionHub.jsx:12068–12078  Live pricing preview in Settings
HOW VERIFIED: Read all four total-computation sites and compared their formulas.
PRICING CHAIN (priceCabLine):
  1. carcassM2 = (2×H×D + 2×W×D + W×H) / 1e6
  2. frontM2 = (W×H) / 1e6
  3. carcassCost = carcassM2 × carcassRatePerM2
  4. hardwareCost = doors × doorHardware + drawers × drawerHardware
  5. assembly = assemblyPerCabinet
  6. finishCost = frontM2 × finish.rate (selected by line.finishId or defaultFinishId)
  7. supply = carcassCost + hardwareCost + assembly + finishCost
  8. if useCalibration: supply *= supplierCalibration
  9. installCost = installHours × installHourlyRate (looked up by type|config)
  10. unitCost = supply + installCost (for ea-mode items)
ESTIMATE TOTAL FORMULA (calc()):
  sub = Σ(qty × rate × (1 + margin/100))
  extras = pmAllowance + deliveryAllowance + protectionAllowance + installSiteSetupHours × installHourlyRate
  overhead = sub × overheadPct/100
  exGst = sub + overhead + varTotal + extras
  gstAmt = exGst × gstPct/100
  total = exGst + gstAmt
ISSUES FOUND:
  BROKEN 1 — issueQuote() EXCLUDES varTotal AND extras from the locked total:
    issueQuote() computes: exGst = sub + ovhd   (NO varTotal, NO extras)
    calc()     computes: exGst = sub + ovhd + varTotal + extras
    The locked quote total stored in quote_versions.total_inc_gst is systematically lower
    than the estimate tab total when approved variations or cabinet extras exist.
    With default SEED_CABLIB: installSiteSetupHours=2 × $113/hr + protectionAllowance=$153.22
    = $379.22 missing from every cabinetry quote that uses a cabConfig.
  BROKEN 2 — QuoteDocument EXCLUDES extras but INCLUDES varTotal:
    QuoteDocument computes: exGst = sub + ovhd + varTotal   (no extras)
    This differs from both calc() and issueQuote(). The printed/displayed quote shows
    a total that matches neither the estimate tab nor the locked snapshot.
  GST: CORRECT. gstAmt = exGst × (gstPct/100) is equivalent to multiplying by (1 + gstPct/100).
    No divide-by-0.9 error found.
  MARGIN vs MARKUP: The field is labelled "margin" everywhere (defaultMargin, margin_pct).
    The formula implements MARKUP: sell = rate × (1 + margin/100). A 20% "margin" is a
    16.7% true gross margin. This is consistent throughout (calc, issueQuote, QuoteDocument
    all use the same formula). Named wrong but consistently wrong. The Settings Live Pricing
    Preview correctly describes it as an additive step.
  ROUNDING: priceCabLine returns parseFloat(...toFixed(2)) per cost component. The $$ 
    formatter uses toLocaleString with 2 decimal places. No pathological accumulation found.
  LOOKUP SILENT ZERO: installRates lookup falls through to undefined if no type|config match,
    returning installHours=0 silently. Appliance/Hardware/Misc types legitimately return 0.
    New types/configs outside the defined table also return 0 with no warning.
  DOUBLE-COUNTING: None found. Extras are added once in calc() only. No summation range
    overlap in the visible formulas.
GAPS: The two broken findings above affect customer-facing quote totals.
```

---

## V11 — Navigation Funnel

```
VERDICT: PARTIAL
EVIDENCE:
  ConstructionHub.jsx:828–838  NAV array: 9 sidebar items
  ConstructionHub.jsx:2869–2884  WORKSPACE_TABS: 14 project tabs
  ConstructionHub.jsx:2950–2965  Tab rendering conditional on tab state
  ConstructionHub.jsx:2887–2895  ROLE_PERMISSIONS: estimator, production, accounts, viewer
HOW VERIFIED: Read NAV and WORKSPACE_TABS arrays, checked rendering conditions, checked
  which tabs have real data vs placeholders.
ROUTES / NAV ITEMS:
  dashboard    → Dashboard component — real data ✓
  projects     → ProjectsModule — real data ✓
  clients      → real data ✓
  builders     → real data ✓
  suppliers    → real data ✓
  rates        → Rate Library — real data ✓
  reporting    → not confirmed as real; need to check component (not read)
  billing      → BillingPage component — subscription/plan display ✓
  settings     → SettingsModule — real data ✓
WORKSPACE TABS:
  cabinets     → CabinetDatabase — real data ✓
  boxmatrix    → BoxMatrix — real data ✓
  takeoff      → TakeoffModule — real data ✓
  schemes      → SchemesModule — real data ✓
  preset       → CabinetPreset — real data ✓
  estimate     → EstimateModule — real data ✓
  quote        → QuoteModule — real data ✓
  orderlist    → OrderListModule — real data ✓
  production   → ProductionModule — real data ✓
  procurement  → ProcurementModule — real data ✓
  jobcost      → JobCostsModule — HANDOFF says placeholder; Xero simulated
  handover     → HandoverModule — real data ✓ (lib/db/handover.ts exists)
  claims       → ClaimsModule — HANDOFF says placeholder; lib/db/claims.ts exists
  info         → project info panel — real data ✓
GAPS:
  - pushToEstimate() and importFromTakeoff() in EstimateModule implement the same concept
    (takeoff→estimate transfer) via two slightly different code paths. Not confirmed duplicate,
    but worth reviewing for consolidation.
  - reporting nav: not read; marked UNVERIFIABLE for real-data status.
  - jobcost and claims: HANDOFF says "coming later placeholders" but lib/db/ files exist.
    The extent of the placeholder vs real implementation is unclear without deeper reading.
```

---

## V12 — Happy Path

```
VERDICT: CONFIRMED
EVIDENCE:
  ConstructionHub.jsx:1268–1278  openProj() — routes to setup wizard if !project_setup_complete
  ConstructionHub.jsx:1182–1184  createProject() — opens setup wizard for new projects
  components/project/ProjectSetup.jsx  (exists per Glob)
  components/project/WorkflowSelector.jsx  (exists per Glob)
  ConstructionHub.jsx:2950  TakeoffModule rendered on tab="takeoff"
HOW VERIFIED: Traced createProject() → setProjectStep("setup") → ProjectSetup → WorkflowSelector
  → workspace tabs → takeoff.
HAPPY PATH:
  1. Dashboard / Projects: + New Project → dialog → name, client, address → createProject() → Supabase ✓
  2. ProjectSetup wizard opens automatically for new projects (project_setup_complete = false) ✓
  3. WorkflowSelector: manual / ai_assisted / ai_takeoff options (component exists) ✓
  4. Takeoff screen: accessible via tab="takeoff"; PDF upload → AI Extract or manual items ✓
GAPS:
  - WorkflowSelector content not fully read; the connection from ProjectSetup → WorkflowSelector
    relies on the internal step machine in ConstructionHub. Assumed correct per code structure.
  - If project has project_setup_complete = true (e.g., duplicated projects), setup wizard
    is skipped and user goes directly to workspace — this is correct behaviour.
  - One potential dead end: if the AI key is unconfigured and the user picks ai_takeoff mode,
    they see an error at extract time, not at workflow selection time.
```

---

## V13 — Branding

```
VERDICT: PARTIAL
EVIDENCE:
  ConstructionHub.jsx:36   "QUANTAFLOW — Standalone Construction Estimating Platform" (comment)
  ConstructionHub.jsx:1375  "Verixo by Shilacon" (sidebar, literal string)
  ConstructionHub.jsx:1620,1626,1341  "Verixo" (welcome screen, setup toast)
  ConstructionHub.jsx:665,687  console.error("Verixo module error:") (error boundaries)
  ConstructionHub.jsx:4733  encodeURIComponent("Verixo — Purchase AI Credits") (email subject)
  app/terms/page.tsx:136   "← Back to Verixo" (literal)
  app/privacy/page.tsx:148  "← Back to Verixo" (literal)
  app/terms/page.tsx:131, app/privacy/page.tsx:119  hello@verixo.com (literal email)
HOW VERIFIED: Grep'd for both product names across all files.
GAPS:
  - No single PRODUCT_NAME constant. "Verixo" appears as scattered string literals in ≥12
    locations across ConstructionHub.jsx plus 2 legal pages.
  - "QUANTAFLOW" survives in the ConstructionHub.jsx file comment header (line 36) — a legacy
    artefact from the original project name.
  - Tenant name IS rendered from data: {company.name} everywhere in quotes, PDFs, sidebar,
    and legal signatures (e.g., "authorise {company.name||'the contractor'} to proceed").
    No hardcoded client/tenant name exists.
  - A product rename from "Verixo" to another name would require editing:
    * ConstructionHub.jsx: 12+ string literals
    * app/terms/page.tsx: 2 literals + 1 email address
    * app/privacy/page.tsx: 3 literals + 1 email address
    * Any future marketing/meta text in app/layout.tsx, app/page.tsx (not fully read)
```

---

## V14 — Activity Feed Detail [feasibility only]

```
VERDICT: PARTIAL
EVIDENCE:
  lib/db/_base.ts:49–71  logActivity() signature: entity_type, entity_id, action, summary, meta
  ConstructionHub.jsx:2438–2442  feed renders: icon + summary + timeAgo (no "who", no entity link)
HOW VERIFIED: Read activity_logs schema (inferred from logActivity signature and HANDOFF.md
  "insert-only activity_logs"), read the feed renderer.
SCHEMA SUPPORT (no migration needed):
  - WHO: user_id column exists — join to profiles.full_name is possible without migration.
    Currently not rendered.
  - DID WHAT: action column exists ("create"/"update"/"delete") + summary text. ✓
  - TO WHAT: entity_type + entity_id exist. Entity name not cached; requires join or 
    adding an entity_name text column (single migration line).
  - WHERE: NO project_id column on activity_logs (as far as can be determined from the
    logActivity() signature and HANDOFF.md). Most entity operations are project-scoped
    but the project context is not logged. A project_id column would require migration.
  - WHEN: created_at exists. ✓
WHAT REQUIRES MIGRATION:
  - entity_name text column (cache the name at log time to avoid join maintenance)
  - project_id uuid column (so each entry knows its project context)
WHAT REQUIRES ONLY CODE CHANGE (no migration):
  - Render user_id → profiles.full_name in the feed
  - Populate meta JSONB with before/after values (meta is currently always {})
```

---

## V15 — Dashboard Empty States [current behaviour only]

```
VERDICT: CONFIRMED
EVIDENCE:
  ConstructionHub.jsx:2652–2655  "No projects yet. Create your first project →" (clickable link)
  ConstructionHub.jsx:2660  "No activity recorded yet." (activity feed)
  ConstructionHub.jsx:2354–2356  "No quotes issued yet — issue quotes from the Quote tab"
  ConstructionHub.jsx:2392–2394  "No active projects — add due dates to projects to see your forecast."
  ConstructionHub.jsx:2509–2511  "No projects match this filter." (filter result empty)
  ConstructionHub.jsx:2856–2861  Projects table: "No projects yet / Click + New Project..."
HOW VERIFIED: Read all empty-branch renderers in Dashboard and ProjectsModule.
CURRENT BEHAVIOUR:
  - All empty states have explicit copy. No blank/null/undefined renders found.
  - The "Create your first project →" text is an onClick (setNav) link, not a dead string.
  - Top-client card is conditionally rendered: hidden when topClients.length===0 (no empty
    state needed; card simply absent).
  - Revenue forecast: bar chart renders with flat/zero bars when no due-date data exists;
    the explanatory text below is "No active projects — add due dates..."
NOTES: Do NOT change these. Reporting as observed.
```

---

## Summary Table

| ID | Title | Verdict | Status |
|----|-------|---------|--------|
| V1 | Takeoff/Estimate parity [INV-1] | BROKEN | No sync mechanism; divergence is permanent after pushToEstimate + any subsequent edit |
| V2 | AI confirmation gate and confidence [INV-2] | PARTIAL | Cabinet DB path gates on ai_draft; takeoff→estimate push has no confidence filter |
| V3 | Live revision diff and variation costing [INV-3] | MISSING | saveTakeoff() overwrites; no versioning, no diff engine, no cost delta |
| V4 | Grouping per unit / item type / level [INV-4] | CONFIRMED | Schema columns + computed grouping at view time; qty column exists |
| V5 | Tenant isolation [INV-5] | PARTIAL | 3 in-repo tables verified; ~20 tables applied directly in Supabase, cannot verify from repo |
| V6 | Per-line finish override | PARTIAL | Takeoff→estimate path supports finishId per line via JSONB; cabinets table has no typed finish_id |
| V7 | Persistence in Supabase | PARTIAL | Core entities in Supabase; qf_xero, qf_ai, qf_theme still localStorage-only |
| V8 | Audit trail | PARTIAL | Project/estimate/variation/quote writes logged; cabinet, takeoff, item-level writes not logged; "who" not rendered |
| V9 | File ingestion | PARTIAL | PDF only; no DWG/DXF; no vector detection; 120s timeout risk on large sets |
| V10 | Pricing engine correctness | BROKEN | issueQuote() excludes varTotal + extras; QuoteDocument excludes extras; calc() includes both |
| V11 | Navigation funnel | PARTIAL | 9 nav + 14 workspace tabs; jobcost/claims partially placeholder; reporting not verified |
| V12 | Happy path | CONFIRMED | Full path: new project → setup wizard → workflow selector → takeoff exists and connects |
| V13 | Branding | PARTIAL | No PRODUCT_NAME constant; "Verixo" in 12+ literals; "QUANTAFLOW" lingers in comment header |
| V14 | Activity feed detail [feasibility] | PARTIAL | who/when/what storable without migration; "where" (project_id) and entity_name need migration |
| V15 | Dashboard empty states | CONFIRMED | All empty states have copy; none blank; "first project" link is functional |

---

## Ranked Findings

Ranked by likelihood of producing a wrong number in a customer-facing quote OR a tenant data leak.

---

### RANK 1 — Quote total diverges from estimate total (V10 BROKEN)
**What is wrong:** Three separate computation sites produce three different totals for the same job:
- `calc()` (estimate tab + dashboard header): includes `varTotal` + `extras`
- `QuoteDocument` (printed/displayed quote): includes `varTotal`, EXCLUDES `extras`
- `issueQuote()` (locked quote_versions.total_inc_gst): excludes both `varTotal` AND `extras`

With default SEED_CABLIB values, `extras` = installSiteSetupHours×installHourlyRate + protectionAllowance = 2×$113 + $153.22 = **$379.22** missing from every locked cabinetry quote.

**Files/lines:**
- `ConstructionHub.jsx:459–470` — `calc()` includes varTotal + extras
- `ConstructionHub.jsx:6267–6272` — `QuoteDocument` includes varTotal, not extras
- `lib/db/quotes.ts:107–114` — `issueQuote()` uses only `sub + ovhd`

**Smallest safe fix:** In `issueQuote()`, load the project's `cabConfig` extras and add them to `exGst`. In `QuoteDocument`, add `extras` to the displayed total. These are independent changes. Do NOT consolidate all three into a shared function until the test cases above are verified to match.

**Blast radius:** Every cabinetry quote issued. Any project with approved variations and a locked quote. Could result in under-pricing on every signed contract.

**Safe to fix autonomously:** YES for `issueQuote()` extras inclusion. **NO** for QuoteDocument — verify against real data before changing; customer may have saved PDFs based on current formula.

---

### RANK 2 — Unverified RLS on core tables (V5 PARTIAL)
**What is wrong:** The `projects`, `estimates`, `estimate_items`, `takeoffs`, `quote_versions`, `variations`, and ~15 other tables have their RLS applied via migrations run directly in Supabase SQL Editor. None of those migrations are in the repo. It is not possible to confirm correctness from code alone.

**Files:** `ConstructionHubDocs/HANDOFF.md:21–33` acknowledges this; `lib/db/projects.ts:6` states "Reads rely on RLS." If any of these policies is missing or uses `USING(true)`, tenant A can read tenant B's pricing, project details, or estimate items.

**Smallest safe fix:** Export the live schema from Supabase Dashboard (Settings → Schemas → Download) and commit it to `supabase/migrations/` as a reference snapshot. Run a two-account isolation test (HANDOFF.md §10 calls this out explicitly).

**Blast radius:** If misconfigured: complete cross-tenant data exposure. Highest possible blast radius.

**Safe to fix autonomously:** NO. Requires live Supabase access and a two-account test.

---

### RANK 3 — Takeoff → estimate divergence (V1 BROKEN)
**What is wrong:** After `pushToEstimate()`, if the operator edits the takeoff (re-runs AI, adds/removes items), the estimate is NOT updated. The pushed estimate lines become stale. A re-run of AI Extract calls `saveTakeoff()` which deletes the takeoff record but leaves the old takeoff-sourced estimate lines untouched.

**Files/lines:**
- `lib/db/takeoffs.ts:70` — `DELETE` before reinsert
- `ConstructionHub.jsx:4612–4637` — `pushToEstimate()` appends to existing lines, never removes old

**Smallest safe fix:** Add a warning in `pushToEstimate()` if `lineItems` already contains `source==="takeoff"` items: "Estimate already contains takeoff items. Replace them?" Then on confirm, delete existing source=takeoff lines before adding new ones.

**Blast radius:** Estimate totals include double-counted items if the operator pushes twice. Quote totals are overstated.

**Safe to fix autonomously:** YES (UI warning + conditional delete of prior takeoff-sourced lines).

---

### RANK 4 — AI confidence hardcoded at 70; unconfirmed items reach quote (V2 PARTIAL)
**What is wrong:** All AI draft cabinets receive `ai_confidence: 70` regardless of the AI's per-batch confidence signal. Low-confidence takeoff items can be pushed to the estimate with no gate. A "needs review" (< 70%) item would never be marked as such.

**Files/lines:**
- `ConstructionHub.jsx:3677` — hardcoded `ai_confidence: 70`
- `ConstructionHub.jsx:4554–4572` — `pushToEstimate()` iterates `items` with no confidence filter

**Smallest safe fix:** (1) Map the batch-level "high/medium/low" confidence to a per-item numeric score at creation time rather than hardcoding 70. (2) Add an opt-in filter in `pushToEstimate()`: "Only push items with confidence ≥ 70%?"

**Blast radius:** Low-confidence AI lines enter signed quotes. For small projects the dollar impact may be minor; for large apartment blocks with many low-confidence items it is significant.

**Safe to fix autonomously:** YES for (1). Conditional/opt-in for (2).

---

### RANK 5 — localStorage-only AI config exposes API key (V7 PARTIAL)
**What is wrong:** `qf_ai` in localStorage can store an `apiKey` (used in "direct" mode). This key is visible in DevTools → Application → Local Storage and persists across sessions.

**Files/lines:**
- `ConstructionHub.jsx:3877–3884` — reads apiKey from localStorage and sets it in headers
- `ConstructionHub.jsx:3882–3884` — `anthropic-dangerous-direct-browser-access: true` header

**Smallest safe fix:** Remove the `direct` mode option entirely (it is documented as DEV ONLY). The proxy mode via `/api/ai` is the correct production path and is already implemented.

**Blast radius:** API key exposure if a user has set it in localStorage. Could result in unbounded AI spend.

**Safe to fix autonomously:** YES — remove the direct-mode branch from `callAI()`.

---

### RANK 6 — Revision overwrite loses drawing history (V3 MISSING)
**What is wrong:** Re-running AI Extract calls `saveTakeoff()` which DELETEs the existing takeoff record. Previous drawing data, AI summary, and all takeoff items are permanently destroyed. No versioning, no diff, no before/after comparison.

**Files/lines:**
- `lib/db/takeoffs.ts:70` — `await supabase.from("takeoffs").delete().eq("project_id", projectId)`

**Smallest safe fix (schema only):** Add `version_number integer default 1` and `superseded_at timestamptz` to `takeoffs`. Change `saveTakeoff()` to INSERT a new row and set `superseded_at = now()` on the previous row instead of deleting it. No UI change needed initially.

**Blast radius:** Loss of audit trail for drawings. No financial impact directly; operational impact if operators need to compare revision quotes.

**Safe to fix autonomously:** Schema change only (additive migration). YES for schema; careful review before changing `saveTakeoff()`.

---

*End of verification report.*
