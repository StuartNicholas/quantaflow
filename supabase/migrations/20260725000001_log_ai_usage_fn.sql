-- ============================================================
-- Verixo — log_ai_usage SECURITY DEFINER function
-- Allows the AI API route to insert usage logs and bump the
-- monthly counter using the caller's user JWT (not service role).
-- Same pattern as admin_upsert_entitlement.
-- ============================================================

CREATE OR REPLACE FUNCTION log_ai_usage(
  p_company_id     uuid,
  p_user_id        uuid,
  p_project_id     uuid,
  p_feature        text,
  p_model          text,
  p_input_tokens   integer,
  p_output_tokens  integer,
  p_estimated_cost numeric,
  p_credits_used   integer DEFAULT 1
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO ai_usage_logs (
    company_id, user_id, project_id, feature, model,
    input_tokens, output_tokens, estimated_cost, credits_used
  ) VALUES (
    p_company_id, p_user_id, p_project_id, p_feature, p_model,
    p_input_tokens, p_output_tokens, p_estimated_cost, p_credits_used
  );

  UPDATE company_entitlements
  SET ai_usage_this_month = ai_usage_this_month + 1,
      updated_at = now()
  WHERE company_id = p_company_id
    AND ai_monthly_limit != -1;  -- don't bother counting for unlimited accounts
END;
$$;

-- Grant execute to authenticated users (the user JWT will call this via RPC)
GRANT EXECUTE ON FUNCTION log_ai_usage(uuid, uuid, uuid, text, text, integer, integer, numeric, integer)
  TO authenticated;
