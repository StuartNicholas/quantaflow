-- ─────────────────────────────────────────────────────────────────────────────
-- RLS POLICY DEDUPLICATION — 2026-08-04
-- Removes redundant duplicate policies that accumulated over time.
-- The surviving policies are functionally identical to the removed ones.
-- Safe to run: DROP POLICY IF EXISTS never errors if the policy is missing.
-- ─────────────────────────────────────────────────────────────────────────────

-- clients: the "clients_*" set is identical to the "company clients *" set.
-- Keep "company clients *", remove the older duplicates.
DROP POLICY IF EXISTS "clients read"   ON clients;
DROP POLICY IF EXISTS "clients insert" ON clients;
DROP POLICY IF EXISTS "clients update" ON clients;
DROP POLICY IF EXISTS "clients delete" ON clients;

-- profiles: "own profile *" is a subset of "profile self *".
-- "profile self read" already covers (id = auth.uid() OR company_id = my_company_id()).
-- Keep "profile self *", remove the narrower duplicates.
DROP POLICY IF EXISTS "own profile read"   ON profiles;
DROP POLICY IF EXISTS "own profile insert" ON profiles;
DROP POLICY IF EXISTS "own profile update" ON profiles;

-- takeoffs: granular set is superseded by the broader to_company_all policy.
DROP POLICY IF EXISTS "takeoffs_select" ON takeoffs;
DROP POLICY IF EXISTS "takeoffs_insert" ON takeoffs;
DROP POLICY IF EXISTS "takeoffs_update" ON takeoffs;
DROP POLICY IF EXISTS "takeoffs_delete" ON takeoffs;

-- takeoff_items: same — granular set superseded by toi_company_all.
DROP POLICY IF EXISTS "takeoff_items_select" ON takeoff_items;
DROP POLICY IF EXISTS "takeoff_items_insert" ON takeoff_items;
DROP POLICY IF EXISTS "takeoff_items_update" ON takeoff_items;
DROP POLICY IF EXISTS "takeoff_items_delete" ON takeoff_items;

-- ai_usage: two identical SELECT policies for company members — remove one.
DROP POLICY IF EXISTS "company members can view their usage" ON ai_usage;
