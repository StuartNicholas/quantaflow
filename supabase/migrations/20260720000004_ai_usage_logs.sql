-- ============================================================
-- Verixo — AI Usage Logs
-- Server-authoritative log of every AI request with token counts,
-- model used, feature, and estimated cost. Feeds the admin area.
-- ============================================================

CREATE TABLE IF NOT EXISTS ai_usage_logs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      uuid REFERENCES companies(id) ON DELETE SET NULL,
  user_id         uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  project_id      uuid REFERENCES projects(id) ON DELETE SET NULL,
  feature         text NOT NULL DEFAULT 'ai_takeoff',
  model           text,
  input_tokens    integer NOT NULL DEFAULT 0,
  output_tokens   integer NOT NULL DEFAULT 0,
  estimated_cost  numeric(10,6) NOT NULL DEFAULT 0,
  credits_used    integer NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ai_usage_logs_company_month_idx
  ON ai_usage_logs(company_id, created_at);

CREATE INDEX IF NOT EXISTS ai_usage_logs_project_idx
  ON ai_usage_logs(project_id) WHERE project_id IS NOT NULL;

ALTER TABLE ai_usage_logs ENABLE ROW LEVEL SECURITY;

-- Members can read their own company's logs (for usage dashboard)
CREATE POLICY "members_read_own_ai_logs" ON ai_usage_logs
  FOR SELECT USING (
    company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid())
  );

-- Only service role inserts (from the API route — never from the browser)

-- Function to reset monthly usage counter on entitlements table.
-- Called by the AI API route after logging, or via a cron job on the 1st.
CREATE OR REPLACE FUNCTION reset_ai_usage_this_month(p_company uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE company_entitlements
  SET ai_usage_this_month = 0, updated_at = now()
  WHERE company_id = p_company;
END;
$$;
