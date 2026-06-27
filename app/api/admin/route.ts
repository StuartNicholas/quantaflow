import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

const ADMIN_EMAIL = "stuart.dean.nicholas@gmail.com";

// Service-role client — only used for auth.admin.listUsers (getting emails)
function adminDb() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

// User-session client — uses the caller's JWT so admin RLS policies apply
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
  // Verify via anon client + JWT (doesn't need service role)
  const { data } = await userDb(token).auth.getUser();
  return data?.user?.email === ADMIN_EMAIL ? token : null;
}

export async function GET(req: Request) {
  const token = await verifyAdmin(req);
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db = userDb(token);

  const [companiesRes, profilesRes] = await Promise.all([
    db.from("companies").select("*").order("created_at", { ascending: false }),
    db.from("profiles").select("id, company_id, full_name, role, created_at"),
  ]);

  const usageRes = await db.from("ai_usage")
    .select("company_id, credits, kind, pages, created_at")
    .order("created_at", { ascending: false });

  const planRequestsRes = await db.from("plan_change_requests")
    .select("*").order("requested_at", { ascending: false });

  const creditRequestsRes = await db.from("credit_purchase_requests")
    .select("*").order("requested_at", { ascending: false });

  // auth.admin.listUsers genuinely needs service role — gracefully skip if unavailable
  let authUsers: any[] = [];
  try {
    const { data } = await adminDb().auth.admin.listUsers({ perPage: 1000 });
    authUsers = data?.users || [];
  } catch {
    // service role key format not supported — emails won't show but everything else works
  }

  return NextResponse.json({
    companies: companiesRes.data || [],
    usage: usageRes.data || [],
    profiles: profilesRes.data || [],
    authUsers,
    planRequests: planRequestsRes.data || [],
    creditRequests: creditRequestsRes.data || [],
    debug: companiesRes.error || profilesRes.error || usageRes.error ? {
      companiesError: companiesRes.error?.message || null,
      profilesError: profilesRes.error?.message || null,
      usageError: usageRes.error?.message || null,
    } : null,
  });
}

export async function POST(req: Request) {
  const token = await verifyAdmin(req);
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { action, companyId, plan, aiMonthlyLimit, aiCreditsExtra } = body;

  if (action === "updateCompany") {
    const update: Record<string, unknown> = {};
    if (plan !== undefined) update.plan = plan;
    if (aiMonthlyLimit !== undefined) update.ai_monthly_limit = aiMonthlyLimit;
    if (aiCreditsExtra !== undefined) update.ai_credits_extra = aiCreditsExtra;
    const { error } = await userDb(token).from("companies").update(update).eq("id", companyId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  if (action === "approvePlanRequest") {
    const { requestId, requestedPlan, requestedLimit } = body;
    const db = userDb(token);
    const PLAN_CREDITS: Record<string, number> = { beta:100, starter:200, team:500, pro:1500, enterprise:-1 };
    const newLimit = requestedPlan === "enterprise" ? -1 : (PLAN_CREDITS[requestedPlan] ?? requestedLimit ?? 100);
    const [updateReq, updateCo] = await Promise.all([
      db.from("plan_change_requests").update({ status:"approved", processed_at: new Date().toISOString() }).eq("id", requestId),
      db.from("companies").update({ plan: requestedPlan, ai_monthly_limit: newLimit }).eq("id", companyId),
    ]);
    if (updateReq.error) return NextResponse.json({ error: updateReq.error.message }, { status: 500 });
    if (updateCo.error) return NextResponse.json({ error: updateCo.error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  if (action === "fulfillCreditRequest") {
    const { requestId, creditsToAdd } = body;
    const db = userDb(token);
    const [coRes] = await Promise.all([
      db.from("companies").select("ai_credits_extra").eq("id", companyId).maybeSingle(),
    ]);
    const currentExtra = coRes.data?.ai_credits_extra || 0;
    const [updateReq, updateCo] = await Promise.all([
      db.from("credit_purchase_requests").update({ status:"fulfilled", fulfilled_at: new Date().toISOString() }).eq("id", requestId),
      db.from("companies").update({ ai_credits_extra: currentExtra + creditsToAdd }).eq("id", companyId),
    ]);
    if (updateReq.error) return NextResponse.json({ error: updateReq.error.message }, { status: 500 });
    if (updateCo.error) return NextResponse.json({ error: updateCo.error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
