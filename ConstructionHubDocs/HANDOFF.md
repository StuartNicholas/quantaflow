# Construction Hub — Project Handoff (current state)

**Read this AFTER the founder docs (README.md → MasterPlan → Version1Scope → DatabaseRequirements → ClaudeInstructions).**
Those define what to build. This file defines **where the build currently stands** so you don't re-derive decisions, re-run migrations, or break verified work. Where this file and the founder docs ever conflict, the founder docs win on *scope*; this file wins on *current state of the code/DB*.

---

## 1. What this project is (one line)
A multi-company SaaS Commercial Operations & Knowledge Platform for joinery/cabinetry. Next.js 16 (App Router) + React 19 on Vercel, Supabase (Postgres + Auth + RLS), server-side AI proxy route. AI takeoff is one module; the platform is much larger (see Version1Scope).

## 2. Honest completion status
Measured against the full V1 scope, the platform is roughly **25–30% complete**. A strong estimating + cabinetry-pricing core exists; most commercial/knowledge modules (quote versioning, revisions, variations, procurement, handover, knowledge base, reporting, builders, suppliers) are **not built yet**. Don't mistake the polished estimating core for a near-complete V1.

## 3. Architecture rules that are NOT obvious from the code (critical)

1. **Data layer is half-migrated. Do not add new localStorage features.**
   - In Supabase (correct): companies, profiles, projects, clients, estimates + estimate_items, catalogue_sections, catalogue_items, cabinet_formula, project_cabinet_preset, preset_templates, project_room_preset, project_board_override, activity_logs, usage metering.
   - Still in localStorage (legacy, to be migrated later): `qf_rates`, `qf_company`, `qf_cablib`, `qf_xero`, `qf_trash`, `qf_templates`, `qf_ai`.
   - **Rule:** every new persisted feature goes through the `/lib/db/*` data-access layer (see §5), Supabase-first, company-scoped, audited. Never build a new feature on `useLS`.

2. **All SQL has already been run in Supabase, in order.** Schema lives in the database, not the repo. **Do not recreate or re-run these as if new.** Migrations applied (each was run in the Supabase SQL Editor, never pushed to Vercel):
   - SECURITY-RESET (RLS + `my_company_id()` SECURITY DEFINER helper)
   - USAGE-METERING (company_plans, usage_events, consume_credits)
   - CATALOGUE layer 1 (sections + items + `can_edit_library()` + library lock cols)
   - CABINET-FORMULA layer 3 (cabinet_formula + project_cabinet_preset)
   - PRESET-TEMPLATES layer 4
   - ROOM-PRESETS layer 5 (project_room_preset)
   - PHASE 0 (audit cols on projects + insert-only activity_logs)
   - PHASE 1 (clients, estimates, estimate_items + RLS)
   - CABINET-LIBRARY layer 6 (extra cabinet_formula cost-chain cols)
   - ORDER-LIST layer 7 (board sheet sizes on catalogue_items + project_board_override + projects.sheet_contingency_pct)
   - USER-DISPLAYNAME (profiles.full_name + self read/update policy)
   - **New schema = a new additive SQL file the user runs in Supabase. Always `if not exists`. Never destructive.**

3. **AI never sets pricing.** Libraries/presets/formula drive price; AI supplies only quantities, sizes, types, room allocations, confidence. This is a hard founder rule. Keep AI modular (separate concerns), metered, and review-gated.

4. **Auditability + versioning are mandatory.** `activity_logs` is insert-only (no update/delete policy). Commercial entities carry `created_by`/`updated_by`/`updated_at`. Quotes (when built) must be versioned and never overwritten.

## 4. The cabinetry pricing engine — VERIFIED, do not "improve" without re-verifying
Pure functions in `ConstructionHub.jsx`: `priceCabinet`, `generateCabinetLibrary`, `cabinetParts`, `estimateSheets`, `parseCabConfig`, `loadCabinetPricing`.

These were reverse-engineered from the user's real spreadsheet (`85_Swann_Rd_-_Quote__A_.xlsx`, CABINET_LIBRARY + PROJECT_DEFAULTS tabs) and **match it to the cent**. Load-bearing details:
- Carcass area = **2 sides (H×D) + top + bottom (W×D) + back (W×H)**, default **0 shelves** (shelves are an editable rule, but the spreadsheet uses none).
- **Round carcass m² to 3 decimals BEFORE costing** (the spreadsheet does; this is the last few cents).
- Cost chain (spreadsheet model, the default): carcass board + flat door hardware ($/door) + flat drawer hardware ($/drawer) + assembly allowance, then **× supplier calibration**, then **+ fronts priced separately at the finish rate**.
- Verified examples: Base 2-Door 1000 → $539.25 supply; Base 1-Door 600 → $393.96; Base 1-Drawer 300 → $550.88 (board $52/m², finish $165/m², door HW $12, drawer HW $95, assembly $25, calibration 2.89).
- All values are per-company and editable (multi-company product). A `components` pricing model (per-hinge) also exists as an alternative path.
- **If you change any of this, re-run the verification against the spreadsheet numbers above before shipping.**

The Order List sheet estimate (`estimateSheets`) is a **guillotine-row ordering estimate, NOT a CNC nest** — it lays parts in rows accounting for kerf + edge trim, then applies an editable contingency %. This was a deliberate engineering decision (a fake nester that's wrong 20% of the time is worse than a tunable estimate). Keep it labelled as an estimate; don't replace it with naive area÷sheet (under-orders) or oversell it as a true nest.

## 5. Data-access layer (the pattern to follow for every new module)
```
/lib/db/_base.ts      // getIdentity() (session-derived company/user — never trust the browser),
                      // errMsg(), logActivity(), DbResult<T> shape
/lib/db/activity.ts   // re-export of logActivity
/lib/db/clients.ts    // list/create/update/delete
/lib/db/estimates.ts  // getEstimate, updateEstimate, addItem(s), updateItem, deleteItem
/lib/db/projects.ts   // list/create/update/delete + updateProjectQuoteValue (rollup)
```
Rules: resolve `company_id` from the session (not from the browser); stamp `created_by`/`updated_by`; call `logActivity()` on meaningful writes; return `{data,error}`; components render the error, never crash. **New entity → new `/lib/db/<entity>.ts` following this exact shape.**

## 6. Key app structure
- Single file `components/ConstructionHub.jsx` (~5000 lines) is the whole front end. Splitting it is sanctioned but must be **incremental, module-by-module**, not a big-bang rewrite (founder rule: no large rewrites unless necessary).
- `components/AuthGate.tsx` wraps the app (login). Company+profile creation is handled by a DB trigger `on_auth_user_created` — the client must NOT create companies (doing both caused duplicate companies).
- Sandbox note: `window.prompt`/`confirm` are blocked in the deploy runtime. Use the in-app `Modal`/`PromptModal`/`ConfirmModal`, or `safePrompt`/`safeConfirm` wrappers. Don't introduce raw `prompt()`/`confirm()`.

## 7. What's BUILT and working
Auth/multi-tenant + RLS; Projects (Supabase); Clients (Supabase, with safe one-time localStorage import); Estimates + line items (Supabase, totals roll up to `projects.quote_value` for dashboard/quote/list); Catalogue (nested trade→section tabs, items, permission lock); Cabinet Formula tab; Cabinet Preset per project (section-filtered dropdowns, company templates, per-room overrides); Cabinet Library tab (generated priced grid); AI takeoff pipeline (PDF → joinery/rooms/dims/quantities, confidence, metering, circuit-breaker); library-first takeoff item picker (searchable, library-only, trade-gated); Order List tab (board sheets + hardware + items). Account: editable display name (profiles.full_name), logout moved into Settings, user name shown top-right.

Scope discipline already applied: **Scheduling removed**; **Job Costs / Claims / Xero parked as "coming later" placeholders** (founder docs exclude them from V1).

## 8. OPEN THREADS (pick these up — they were left mid-stream, on purpose)
1. **Catalogue item editor doesn't expose sheet-size fields yet.** Columns exist (Layer 7: `sheet_length_mm`, `sheet_width_mm`, `kerf_mm`, `trim_mm`); the Order List reads them; but there's no UI to enter them, so boards fall back to 3600×1800. Add these inputs to the catalogue item form (board items only). *Smallest next win.*
2. **Reconcile the takeoff-push pricing path.** An earlier estimates-persistence change was applied on a snapshot that predated room presets, so `pushToEstimate` in `TakeoffModule` uses project-wide `pricing.rates` rather than room-aware `ratesFor(room)`. Bring it onto the room-aware path so AI-pushed cabinets price per room like the rest.
3. **Phase 2 — Builders & Suppliers + Project Setup Wizard.** Next major phase per the approved build order. Builders/Suppliers are core entities referenced by projects, procurement, and reporting; nothing exists yet.

## 9. Approved build order (from the assessment, user-approved)
Foundation (done) → Supabase persistence (clients ✓, estimates ✓; rates/company/templates still localStorage) → **Builders/Suppliers + Setup Wizard** → AI takeoff persistence (store drawings + persisted takeoff records + review/approve) → **Quote versioning** (versioned, locked, never overwritten — the commercial backbone) → Revisions/Variations → Procurement/Handover → Knowledge/Reporting.

## 10. Workflow & guardrails for working in VS Code
- App code (.jsx/.tsx/.ts) → commit → push to GitHub → Vercel auto-deploys. **SQL → run manually in Supabase SQL Editor (never pushed).** Run SQL first, then deploy code.
- Before changing anything: **diff the repo against the latest session files** and confirm the live `ConstructionHub.jsx` matches the most recent version (with the Order List tab). If they've drifted, reconcile first — building on a stale base is the #1 way this gets confusing.
- Don't rotate/commit secrets. `.env.local` has leaked keys before; keep it out of git and rotate anything exposed.
- Verify tenant isolation with two accounts after any RLS-touching change.
- Keep responses/PRs scoped to one module at a time; no speculative future-module building (founder rule: V1 only).

## 11. Launch-readiness still outstanding (user's external tasks)
Custom domain (clears the browser "Dangerous" flag on *.vercel.app), AI spend cap, two-account isolation self-test, real Xero OAuth (still simulated), Stripe billing (metering built; free beta), server-side PDF quotes + acceptance links, stored drawings.
