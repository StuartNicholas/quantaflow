import { supabase } from "../supabase";
import { errMsg, DbResult } from "./_base";

// ─────────────────────────────────────────────────────────────────────────────
// Entitlements — client-side read of company_entitlements.
// Only reads are exposed to the browser; writes happen server-side only
// via the admin API (service role key).
// ─────────────────────────────────────────────────────────────────────────────

export type Entitlement = {
  id: string;
  company_id: string;
  licence_type: "internal" | "beta" | "paid" | "suspended";
  billing_exempt: boolean;
  subscription_status: "active" | "trialing" | "past_due" | "cancelled" | "paused";
  ai_enabled: boolean;
  ai_monthly_limit: number;
  ai_usage_this_month: number;
  access_starts_at: string | null;
  access_ends_at: string | null;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  created_at: string;
  updated_at: string;
};

export async function getEntitlement(companyId: string): Promise<DbResult<Entitlement>> {
  try {
    const { data, error } = await supabase
      .from("company_entitlements")
      .select("*")
      .eq("company_id", companyId)
      .maybeSingle();
    if (error) return { data: null, error: errMsg(error) };
    return { data: data ?? null, error: null };
  } catch (e) {
    return { data: null, error: errMsg(e) };
  }
}

export function isAiAvailable(entitlement: Entitlement | null): boolean {
  if (!entitlement) return false;
  if (!entitlement.ai_enabled) return false;
  if (entitlement.licence_type === "suspended") return false;
  if (entitlement.subscription_status === "cancelled") return false;
  if (entitlement.ai_monthly_limit === -1) return true; // unlimited
  return entitlement.ai_usage_this_month < entitlement.ai_monthly_limit;
}

export function getLicenceLabel(ent: Entitlement | null): string {
  if (!ent) return "No plan";
  if (ent.licence_type === "internal") return "Internal";
  if (ent.billing_exempt) return "Beta";
  if (ent.subscription_status === "trialing") return "Trial";
  if (ent.subscription_status === "active") return "Active";
  if (ent.subscription_status === "past_due") return "Past Due";
  if (ent.subscription_status === "cancelled") return "Cancelled";
  return ent.licence_type;
}

export function getAiUsagePercent(ent: Entitlement | null): number {
  if (!ent || ent.ai_monthly_limit === -1 || ent.ai_monthly_limit === 0) return 0;
  return Math.min(100, Math.round((ent.ai_usage_this_month / ent.ai_monthly_limit) * 100));
}
