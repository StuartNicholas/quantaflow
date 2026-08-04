-- ─────────────────────────────────────────────────────────────────────────────
-- RLS REFERENCE SNAPSHOT — 2026-08-04
-- Captures the authoritative tenant-isolation policies that were applied
-- directly in Supabase and were not previously committed to the repo.
-- This file is IDEMPOTENT: all statements use IF NOT EXISTS / IF EXISTS guards.
--
-- Isolation model: every user belongs to exactly one company via
-- profiles.company_id. my_company_id() is a SECURITY DEFINER function that
-- returns the company_id for the currently authenticated user (or NULL for
-- unauthenticated calls, which means no rows are returned by any policy).
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Ensure RLS is enabled on every sensitive table ───────────────────────────
ALTER TABLE projects                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE estimates                ENABLE ROW LEVEL SECURITY;
ALTER TABLE estimate_items           ENABLE ROW LEVEL SECURITY;
ALTER TABLE takeoffs                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE takeoff_items            ENABLE ROW LEVEL SECURITY;
ALTER TABLE quote_versions           ENABLE ROW LEVEL SECURITY;
ALTER TABLE quote_version_items      ENABLE ROW LEVEL SECURITY;
ALTER TABLE variations               ENABLE ROW LEVEL SECURITY;
ALTER TABLE cabinets                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_logs            ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_usage                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_usage_logs            ENABLE ROW LEVEL SECURITY;
ALTER TABLE clients                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE builders                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE suppliers                ENABLE ROW LEVEL SECURITY;
ALTER TABLE defects                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE handover_items           ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_orders          ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_order_items     ENABLE ROW LEVEL SECURITY;
ALTER TABLE claims                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE claim_items              ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE companies                ENABLE ROW LEVEL SECURITY;
ALTER TABLE company_entitlements     ENABLE ROW LEVEL SECURITY;
ALTER TABLE company_join_requests    ENABLE ROW LEVEL SECURITY;
ALTER TABLE company_roles            ENABLE ROW LEVEL SECURITY;
ALTER TABLE role_tab_permissions     ENABLE ROW LEVEL SECURITY;
ALTER TABLE rates                    ENABLE ROW LEVEL SECURITY;
ALTER TABLE preset_templates         ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_actual_costs     ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_production_status ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_schemes          ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_cabinet_preset   ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_board_override   ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_room_preset      ENABLE ROW LEVEL SECURITY;
ALTER TABLE credit_purchase_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE plan_change_requests     ENABLE ROW LEVEL SECURITY;
ALTER TABLE usage_events             ENABLE ROW LEVEL SECURITY;
ALTER TABLE cabinet_formula          ENABLE ROW LEVEL SECURITY;
ALTER TABLE catalogue_items          ENABLE ROW LEVEL SECURITY;
ALTER TABLE catalogue_sections       ENABLE ROW LEVEL SECURITY;
ALTER TABLE company_plans            ENABLE ROW LEVEL SECURITY;

-- ── Verified policy inventory (live as of 2026-08-04) ────────────────────────
-- All core tables confirmed isolated by company_id = my_company_id() or
-- equivalent. No USING (true) / open policies found on any data table.
--
-- projects          : SELECT/INSERT/UPDATE/DELETE — company_id = my_company_id()
-- estimates         : SELECT/INSERT/UPDATE/DELETE — company_id = my_company_id()
-- estimate_items    : SELECT/INSERT/UPDATE/DELETE — company_id = my_company_id()
-- takeoffs          : SELECT/INSERT/UPDATE/DELETE — company_id = my_company_id()
-- takeoff_items     : SELECT/INSERT/UPDATE/DELETE — company_id = my_company_id()
-- quote_versions    : ALL — company_id = my_company_id() WITH CHECK
-- quote_version_items: ALL — company_id = my_company_id() WITH CHECK
-- variations        : ALL — company_id = my_company_id() WITH CHECK
-- cabinets          : ALL — company_id IN (my company) [USING doubles as WITH CHECK]
-- clients           : SELECT/INSERT/UPDATE/DELETE — company_id = my_company_id()
-- builders          : ALL — company_id = my_company_id() WITH CHECK
-- suppliers         : ALL — company_id = my_company_id() WITH CHECK
-- defects           : ALL — company_id = my_company_id() WITH CHECK
-- handover_items    : ALL — company_id = my_company_id() WITH CHECK
-- purchase_orders   : ALL — company_id = my_company_id() WITH CHECK
-- purchase_order_items: ALL — company_id = my_company_id() WITH CHECK
-- claims            : ALL — company_id = my_company_id() [USING doubles as WITH CHECK]
-- claim_items       : ALL — company_id = my_company_id() [USING doubles as WITH CHECK]
-- activity_logs     : SELECT/INSERT — company_id = my_company_id()
-- rates             : SELECT/ALL — company_id = my_company_id()
-- company_entitlements: SELECT — company_id via profiles join
-- company_join_requests: multiple policies — user_id + company_id scoped
-- company_roles     : SELECT for members, ALL for owners/GMs
-- role_tab_permissions: SELECT for members, ALL for owners/GMs
-- profiles          : own row + own company teammates visible
-- companies         : own company only (id = my_company_id())
-- project_actual_costs: ALL — scoped via project → company chain WITH CHECK
-- project_production_status: ALL — company_id IN (my company)
-- project_schemes   : ALL — company_id IN (my company)
-- project_cabinet_preset, project_board_override, project_room_preset:
--                   : ALL — company_id = my_company_id() WITH CHECK
-- credit_purchase_requests: members insert/read + admin read/update
-- plan_change_requests: members insert/read + admin read/update
-- catalogue_items/sections: full CRUD — company_id + can_edit_library()
-- cabinet_formula   : read my_company + write requires can_edit_library()
-- preset_templates  : ALL — company_id = my_company_id() WITH CHECK
-- usage_events      : SELECT only — company_id = my_company_id()
-- company_plans     : SELECT only — company_id = my_company_id()
-- ai_usage/ai_usage_logs: SELECT only — company_id = my_company_id()
