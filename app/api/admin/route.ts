import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// ─────────────────────────────────────────────────────────────────────────────
// Shilacon Administration API
// Internal-only. Verified by checking the caller's email against the admin list
// using the service role key (cannot be spoofed from the browser).
// ─────────────────────────────────────────────────────────────────────────────

export const runtime = "nodejs";

// Emails that may access this endpoint. Never hard-code company IDs.
const ADMIN_EMAILS = new Set([
  "stuart.dean.nicholas@gmail.com",
  "stuartdeannicholas@gmail.com",
]);

function adminDb() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

function userDb(token: string) {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false } }
  );
}

async function verifyAdmin(req: Request): Promise<string | null> {
  const token = (req.headers.get("authorization") || "").replace("Bearer ", "");
  if (!token) return null;
  const { data } = await adminDb().auth.getUser(token);
  return data?.user?.email && ADMIN_EMAILS.has(data.user.email) ? token : null;
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/admin — full admin data snapshot
// ─────────────────────────────────────────────────────────────────────────────

export async function GET(req: Request) {
  const token = await verifyAdmin(req);
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db    = adminDb();
  const userClient = userDb(token);

  const [companiesRes, profilesRes, entitlementsRes, usageLogsRes, legacyUsageRes, planRequestsRes, creditRequestsRes] =
    await Promise.all([
      userClient.from("companies").select("*").order("created_at", { ascending: false }),
      userClient.from("profiles").select("id, company_id, full_name, role, created_at"),
      db.from("company_entitlements").select("*"),
      db.from("ai_usage_logs").select("company_id, user_id, feature, model, input_tokens, output_tokens, estimated_cost, credits_used, created_at").order("created_at", { ascending: false }).limit(500),
      // Legacy table — keep reading for backwards compat during transition
      userClient.from("ai_usage").select("company_id, credits, kind, pages, created_at").order("created_at", { ascending: false }).limit(200),
      userClient.from("plan_change_requests").select("*").order("requested_at", { ascending: false }),
      userClient.from("credit_purchase_requests").select("*").order("requested_at", { ascending: false }),
    ]);

  let authUsers: any[] = [];
  try {
    const { data } = await db.auth.admin.listUsers({ perPage: 1000 });
    authUsers = data?.users || [];
  } catch {}

  return NextResponse.json({
    companies:      companiesRes.data      || [],
    profiles:       profilesRes.data       || [],
    entitlements:   entitlementsRes.data   || [],
    usageLogs:      usageLogsRes.data      || [],
    usage:          legacyUsageRes.data    || [], // legacy — kept for backwards compat
    authUsers,
    planRequests:   planRequestsRes.data   || [],
    creditRequests: creditRequestsRes.data || [],
    debug: (companiesRes.error || profilesRes.error) ? {
      companiesError:    companiesRes.error?.message    || null,
      profilesError:     profilesRes.error?.message     || null,
      entitlementsError: entitlementsRes.error?.message || null,
    } : null,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/admin — admin actions
// ─────────────────────────────────────────────────────────────────────────────

export async function POST(req: Request) {
  const token = await verifyAdmin(req);
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body   = await req.json();
  const { action, companyId } = body;
  const db     = adminDb();
  const userClient = userDb(token);

  // ── Entitlement management ─────────────────────────────────────────────────

  if (action === "setEntitlement") {
    const {
      licenceType, billingExempt, subscriptionStatus,
      aiEnabled, aiMonthlyLimit,
    } = body;

    const patch: Record<string, unknown> = {};
    if (licenceType        !== undefined) patch.licence_type        = licenceType;
    if (billingExempt      !== undefined) patch.billing_exempt      = billingExempt;
    if (subscriptionStatus !== undefined) patch.subscription_status = subscriptionStatus;
    if (aiEnabled          !== undefined) patch.ai_enabled          = aiEnabled;
    if (aiMonthlyLimit     !== undefined) patch.ai_monthly_limit    = Number(aiMonthlyLimit);

    // Upsert — handles companies that don't have an entitlement row yet
    const { error } = await db
      .from("company_entitlements")
      .upsert({ company_id: companyId, ...patch }, { onConflict: "company_id" });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  if (action === "enableAi") {
    const { error } = await db
      .from("company_entitlements")
      .upsert({ company_id: companyId, ai_enabled: true }, { onConflict: "company_id" });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  if (action === "disableAi") {
    const { error } = await db
      .from("company_entitlements")
      .upsert({ company_id: companyId, ai_enabled: false }, { onConflict: "company_id" });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  if (action === "resetAiUsage") {
    const { error } = await db
      .from("company_entitlements")
      .update({ ai_usage_this_month: 0 })
      .eq("company_id", companyId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  if (action === "setLicence") {
    const { licenceType, billingExempt } = body;
    const patch: Record<string, unknown> = {};
    if (licenceType   !== undefined) patch.licence_type   = licenceType;
    if (billingExempt !== undefined) patch.billing_exempt = billingExempt;
    const { error } = await db
      .from("company_entitlements")
      .upsert({ company_id: companyId, ...patch }, { onConflict: "company_id" });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  // ── Legacy: plan/credits on companies table ────────────────────────────────

  if (action === "updateCompany") {
    const { plan, aiMonthlyLimit, aiCreditsExtra } = body;
    const update: Record<string, unknown> = {};
    if (plan             !== undefined) update.plan              = plan;
    if (aiMonthlyLimit   !== undefined) update.ai_monthly_limit  = aiMonthlyLimit;
    if (aiCreditsExtra   !== undefined) update.ai_credits_extra  = aiCreditsExtra;
    const { error } = await userClient.from("companies").update(update).eq("id", companyId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  if (action === "approvePlanRequest") {
    const { requestId, requestedPlan, requestedLimit } = body;
    const PLAN_CREDITS: Record<string, number> = { beta: 100, starter: 200, team: 500, pro: 1500, enterprise: -1 };
    const newLimit = requestedPlan === "enterprise" ? -1 : (PLAN_CREDITS[requestedPlan] ?? requestedLimit ?? 100);
    const [updateReq, updateCo] = await Promise.all([
      userClient.from("plan_change_requests").update({ status: "approved", processed_at: new Date().toISOString() }).eq("id", requestId),
      userClient.from("companies").update({ plan: requestedPlan, ai_monthly_limit: newLimit }).eq("id", companyId),
    ]);
    if (updateReq.error) return NextResponse.json({ error: updateReq.error.message }, { status: 500 });
    if (updateCo.error)  return NextResponse.json({ error: updateCo.error.message },  { status: 500 });
    return NextResponse.json({ ok: true });
  }

  if (action === "fulfillCreditRequest") {
    const { requestId, creditsToAdd } = body;
    const coRes = await userClient.from("companies").select("ai_credits_extra").eq("id", companyId).maybeSingle();
    const currentExtra = coRes.data?.ai_credits_extra || 0;
    const [updateReq, updateCo] = await Promise.all([
      userClient.from("credit_purchase_requests").update({ status: "fulfilled", fulfilled_at: new Date().toISOString() }).eq("id", requestId),
      userClient.from("companies").update({ ai_credits_extra: currentExtra + creditsToAdd }).eq("id", companyId),
    ]);
    if (updateReq.error) return NextResponse.json({ error: updateReq.error.message }, { status: 500 });
    if (updateCo.error)  return NextResponse.json({ error: updateCo.error.message },  { status: 500 });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
