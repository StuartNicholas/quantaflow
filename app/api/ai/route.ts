import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// ─────────────────────────────────────────────────────────────────────────────
// Verixo AI proxy — server-side only.
// Security chain (every request, including scans):
//   1. Valid JWT → identify user
//   2. user → profiles → company_id
//   3. company_id → company_entitlements → ai_enabled = true
//   4. subscription_status ∈ {active, trialing}
//   5. [non-scan] ai_monthly_limit === -1 OR usage < limit
//   6. [non-scan] ≤ 8 calls in the last 60 s (DB-backed per user)
//   7. [scan]     ≤ 20 calls in the last 60 s (in-memory per user)
// Model and max_tokens are locked server-side — client values are ignored.
// ─────────────────────────────────────────────────────────────────────────────

export const runtime    = "nodejs";
export const maxDuration = 300; // Vercel Pro max — required for large drawing sets

const COST_PER_1K_INPUT  = 0.005;  // USD — Claude Opus 4.8 ($5/1M input)
const COST_PER_1K_OUTPUT = 0.025;  // USD — Claude Opus 4.8 ($25/1M output)

// Server-locked — the client model field is intentionally ignored
const MODEL = process.env.ANTHROPIC_MODEL ?? "claude-opus-4-8";

// Hard ceiling on output tokens regardless of client request (cabinetry batches need ~8 000)
const MAX_OUTPUT_TOKENS = 8192;

// Accepted feature strings — unknown values fall back to "ai_takeoff"
const VALID_FEATURES = new Set(["ai_scan", "ai_takeoff", "cabinet_takeoff", "ai_extract"]);

// ── In-memory rate limiter for scan calls ────────────────────────────────────
// Scans are not logged to ai_usage_logs, so the DB-backed limiter cannot apply.
// Serverless: each instance has independent state; provides burst protection
// per-instance, which is sufficient for a closed beta.
const scanRateCache = new Map<string, number[]>();

function scanRateLimitOk(userId: string): boolean {
  const now    = Date.now();
  const recent = (scanRateCache.get(userId) ?? []).filter(t => now - t < 60_000);
  if (recent.length >= 20) return false;
  recent.push(now);
  scanRateCache.set(userId, recent);
  return true;
}

// ── Supabase clients ──────────────────────────────────────────────────────────

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

function userClient(token: string) {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth:   { persistSession: false },
    }
  );
}

// ── Identity ──────────────────────────────────────────────────────────────────

type Identity = { userId: string; companyId: string; token: string };

async function resolveIdentity(req: Request): Promise<Identity | null> {
  const authHeader = req.headers.get("authorization") || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!token) return null;
  try {
    const db = userClient(token);
    const { data: userData, error: authErr } = await db.auth.getUser();
    if (authErr || !userData?.user?.id) return null;

    const userId = userData.user.id;
    const { data: profile, error: profErr } = await db
      .from("profiles")
      .select("company_id")
      .eq("id", userId)
      .single();
    if (profErr || !profile?.company_id) return null;

    return { userId, companyId: profile.company_id, token };
  } catch {
    return null;
  }
}

// ── Entitlement ───────────────────────────────────────────────────────────────

type EntitlementCheck = {
  allowed: boolean;
  reason?: string;
  code?: string;
  used?: number;
  limit?: number;
};

async function checkEntitlement(
  companyId: string,
  token: string,
  { checkLimit = true } = {}
): Promise<EntitlementCheck> {
  try {
    const db = userClient(token);
    const { data: ent, error } = await db
      .from("company_entitlements")
      .select("ai_enabled, licence_type, subscription_status, ai_monthly_limit, ai_usage_this_month")
      .eq("company_id", companyId)
      .maybeSingle();

    if (error || !ent) {
      return { allowed: false, reason: "AI access has not been configured for your account. Contact support.", code: "not_configured" };
    }
    if (!ent.ai_enabled) {
      return { allowed: false, reason: "AI features are not enabled for your account. Contact your administrator.", code: "ai_disabled" };
    }
    if (ent.licence_type === "suspended") {
      return { allowed: false, reason: "Your account has been suspended. Contact support.", code: "suspended" };
    }
    if (!["active", "trialing"].includes(ent.subscription_status)) {
      return {
        allowed: false,
        reason: `Your subscription is ${ent.subscription_status}. Update your billing to continue using AI features.`,
        code: "subscription_inactive",
      };
    }
    if (checkLimit && ent.ai_monthly_limit !== -1 && ent.ai_usage_this_month >= ent.ai_monthly_limit) {
      return {
        allowed: false,
        reason: "Your monthly AI allowance has been reached. Contact your administrator or wait for the next billing period.",
        code: "limit_reached",
        used:  ent.ai_usage_this_month,
        limit: ent.ai_monthly_limit,
      };
    }

    return { allowed: true };
  } catch {
    return { allowed: false, reason: "Unable to verify AI access. Please try again.", code: "check_failed" };
  }
}

// ── Rate limit (non-scan calls, DB-backed) ────────────────────────────────────

async function checkRateLimit(
  userId: string,
  token: string
): Promise<{ allowed: boolean }> {
  try {
    const db          = userClient(token);
    const windowStart = new Date(Date.now() - 60_000).toISOString();
    const { count, error } = await db
      .from("ai_usage_logs")
      .select("user_id", { count: "exact", head: true })
      .eq("user_id", userId)
      .gte("created_at", windowStart);
    if (error) return { allowed: true };
    return { allowed: (count ?? 0) < 8 };
  } catch {
    return { allowed: true };
  }
}

// ── Usage logging ─────────────────────────────────────────────────────────────

async function logUsage(
  companyId: string,
  userId: string,
  projectId: string | null,
  feature: string,
  inputTokens: number,
  outputTokens: number,
  estimatedCost: number,
  token: string
): Promise<void> {
  try {
    await userClient(token).rpc("log_ai_usage", {
      p_company_id:     companyId,
      p_user_id:        userId,
      p_project_id:     projectId ?? null,
      p_feature:        feature,
      p_model:          MODEL,
      p_input_tokens:   inputTokens,
      p_output_tokens:  outputTokens,
      p_estimated_cost: estimatedCost,
      p_credits_used:   1,
    });
  } catch {
    // Best-effort — never block the response over a logging failure
  }
}

// ── POST /api/ai ──────────────────────────────────────────────────────────────

export async function POST(req: Request) {
  // ── 1. Parse body ────────────────────────────────────────────────────────────
  let body: any;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: { message: "Invalid JSON body" } }, { status: 400 });
  }

  const { messages, meta } = body ?? {};
  if (!Array.isArray(messages) || messages.length === 0) {
    return NextResponse.json({ error: { message: "messages[] is required and must be non-empty" } }, { status: 400 });
  }

  // Server-side caps — client values for model and max_tokens are ignored
  const max_tokens = Math.min(Math.max(1, Number(body.max_tokens) || 4000), MAX_OUTPUT_TOKENS);
  const feature    = VALID_FEATURES.has(String(meta?.kind || meta?.feature || ""))
    ? String(meta?.kind || meta?.feature)
    : "ai_takeoff";
  const isScan     = feature === "ai_scan";
  const projectId  = typeof meta?.projectId === "string" ? meta.projectId : null;

  // ── 2. Identity ──────────────────────────────────────────────────────────────
  const identity = await resolveIdentity(req);
  if (!identity) {
    return NextResponse.json(
      { error: { message: "Authentication required. Please sign in.", code: "unauthenticated" } },
      { status: 401 }
    );
  }
  const { userId, companyId, token } = identity;

  // ── 3. Entitlement (all requests — scans skip monthly-limit check only) ──────
  const entCheck = await checkEntitlement(companyId, token, { checkLimit: !isScan });
  if (!entCheck.allowed) {
    return NextResponse.json(
      { error: { message: entCheck.reason, code: entCheck.code, used: entCheck.used, limit: entCheck.limit } },
      { status: 402 }
    );
  }

  // ── 4. Rate limiting ─────────────────────────────────────────────────────────
  if (isScan) {
    if (!scanRateLimitOk(userId)) {
      return NextResponse.json(
        { error: { message: "Too many scan requests. Please wait a moment before trying again.", code: "rate_limited" } },
        { status: 429, headers: { "Retry-After": "60" } }
      );
    }
  } else {
    const rl = await checkRateLimit(userId, token);
    if (!rl.allowed) {
      return NextResponse.json(
        { error: { message: "Too many requests. Please wait a moment before trying again.", code: "rate_limited" } },
        { status: 429, headers: { "Retry-After": "60" } }
      );
    }
  }

  // ── 5. Legacy credit RPC (backwards compat, non-fatal if absent) ─────────────
  if (!isScan) {
    try {
      await adminClient().rpc("consume_credits", {
        p_company: companyId, p_user: userId,
        p_kind: feature, p_pages: Number(meta?.pages) || 0,
        p_input_tokens: 0, p_output_tokens: 0, p_est_cost: 0, p_credits: 1,
      });
    } catch { /* RPC may not exist yet */ }
  }

  // ── 6. Anthropic API call ─────────────────────────────────────────────────────
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (!anthropicKey) {
    return NextResponse.json(
      { error: { message: "AI not configured on this server.", code: "no_key" } },
      { status: 500 }
    );
  }

  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type":      "application/json",
        "x-api-key":         anthropicKey,
        "anthropic-version": "2023-06-01",
      },
      // MODEL is server-locked; max_tokens is capped above — neither comes from the client
      body: JSON.stringify({ model: MODEL, max_tokens, messages }),
    });
    const data = await r.json();

    if (!isScan && r.ok) {
      const inTok  = data?.usage?.input_tokens  || 0;
      const outTok = data?.usage?.output_tokens || 0;
      const cost   = (inTok / 1000) * COST_PER_1K_INPUT + (outTok / 1000) * COST_PER_1K_OUTPUT;
      await logUsage(companyId, userId, projectId, feature, inTok, outTok, cost, token);
    }

    return NextResponse.json(data, { status: r.status });
  } catch (e: any) {
    return NextResponse.json({ error: { message: e?.message || "AI proxy error" } }, { status: 500 });
  }
}
