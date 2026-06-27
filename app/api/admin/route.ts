import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

const ADMIN_EMAIL = "stuartdeannicholas@gmail.com";

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

async function verifyAdmin(req: Request): Promise<string | null> {
  const token = (req.headers.get("authorization") || "").replace("Bearer ", "");
  if (!token) return null;
  const { data } = await admin().auth.getUser(token);
  return data?.user?.email === ADMIN_EMAIL ? token : null;
}

export async function GET(req: Request) {
  if (!(await verifyAdmin(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = admin();
  const [companiesRes, usageRes, profilesRes, usersRes] = await Promise.all([
    db.from("companies")
      .select("id, name, plan, ai_monthly_limit, ai_credits_extra, country, created_at")
      .order("created_at", { ascending: false }),
    db.from("ai_usage")
      .select("company_id, credits, est_cost, kind, pages, created_at")
      .order("created_at", { ascending: false }),
    db.from("profiles")
      .select("id, company_id, full_name, role, created_at"),
    db.auth.admin.listUsers({ perPage: 1000 }),
  ]);

  return NextResponse.json({
    companies: companiesRes.data || [],
    usage: usageRes.data || [],
    profiles: profilesRes.data || [],
    authUsers: usersRes.data?.users || [],
  });
}

export async function POST(req: Request) {
  if (!(await verifyAdmin(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { action, companyId, plan, aiMonthlyLimit, aiCreditsExtra } = body;

  if (action === "updateCompany") {
    const update: Record<string, unknown> = {};
    if (plan !== undefined) update.plan = plan;
    if (aiMonthlyLimit !== undefined) update.ai_monthly_limit = aiMonthlyLimit;
    if (aiCreditsExtra !== undefined) update.ai_credits_extra = aiCreditsExtra;
    const { error } = await admin().from("companies").update(update).eq("id", companyId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
