-- ============================================================
-- Verixo — Company Entitlements
-- Permanent licence and AI access control layer.
-- Designed for future Stripe integration without schema changes.
-- ============================================================

CREATE TABLE IF NOT EXISTS company_entitlements (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id           uuid NOT NULL UNIQUE REFERENCES companies(id) ON DELETE CASCADE,

  -- Licence classification
  licence_type         text NOT NULL DEFAULT 'beta'
    CONSTRAINT ent_licence_type_check
    CHECK (licence_type IN ('internal','beta','paid','suspended')),

  -- Billing flags (Stripe will populate these later)
  billing_exempt       boolean NOT NULL DEFAULT false,
  subscription_status  text NOT NULL DEFAULT 'trialing'
    CONSTRAINT ent_sub_status_check
    CHECK (subscription_status IN ('active','trialing','past_due','cancelled','paused')),

  -- AI access control — must be explicitly enabled per company
  ai_enabled           boolean NOT NULL DEFAULT false,
  ai_monthly_limit     integer NOT NULL DEFAULT 0,  -- -1 = unlimited
  ai_usage_this_month  integer NOT NULL DEFAULT 0,

  -- Access window (optional — null means no time restriction)
  access_starts_at     timestamptz,
  access_ends_at       timestamptz,

  -- Stripe placeholder fields (populated when Stripe is integrated)
  stripe_customer_id   text,
  stripe_subscription_id text,

  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE company_entitlements ENABLE ROW LEVEL SECURITY;

-- Members can read their own entitlement (to show plan info, AI limits)
CREATE POLICY "members_read_own_entitlement" ON company_entitlements
  FOR SELECT USING (
    company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid())
  );

-- Only service role can write (admin API uses service role key)
-- No INSERT/UPDATE/DELETE policy for anon/authenticated roles by design.

-- Auto-stamp updated_at
CREATE OR REPLACE FUNCTION _verixo_entitlements_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS company_entitlements_updated_at ON company_entitlements;
CREATE TRIGGER company_entitlements_updated_at
  BEFORE UPDATE ON company_entitlements
  FOR EACH ROW EXECUTE FUNCTION _verixo_entitlements_updated_at();

-- ── Backfill: create a default entitlement row for every existing company ──
INSERT INTO company_entitlements (company_id, licence_type, billing_exempt, subscription_status, ai_enabled, ai_monthly_limit)
SELECT id, 'beta', false, 'trialing', false, 0
FROM companies
ON CONFLICT (company_id) DO NOTHING;

-- ── Configure Omen Cabinets as internal / billing-exempt / AI-enabled ──
DO $$
DECLARE
  v_user_id   uuid;
  v_company_id uuid;
BEGIN
  -- Try both email formats (Supabase stores exactly as entered at signup)
  SELECT id INTO v_user_id
  FROM auth.users
  WHERE lower(email) IN ('stuart.dean.nicholas@gmail.com','stuartdeannicholas@gmail.com')
  ORDER BY created_at ASC
  LIMIT 1;

  IF v_user_id IS NOT NULL THEN
    SELECT company_id INTO v_company_id
    FROM profiles
    WHERE id = v_user_id
    LIMIT 1;

    IF v_company_id IS NOT NULL THEN
      UPDATE company_entitlements
      SET licence_type        = 'internal',
          billing_exempt      = true,
          ai_enabled          = true,
          subscription_status = 'active',
          ai_monthly_limit    = -1,
          updated_at          = now()
      WHERE company_id = v_company_id;
    END IF;
  END IF;
END $$;
