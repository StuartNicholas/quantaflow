import { NextResponse } from "next/server";
import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";

// ─────────────────────────────────────────────────────────────────────────────
// Verixo AI proxy — server-side only.
// Security chain (every request):
//   1. Valid JWT → identify user
//   2. user → profiles → company_id
//   3. company_id → company_entitlements → ai_enabled = true
//   4. subscription_status ∈ {active, trialing}
//   5. ai_monthly_limit === -1 OR ai_usage_this_month < ai_monthly_limit
// Any failure at steps 1-5 rejects the request before touching the AI.
// Never rely solely on hiding buttons in the UI.
// ─────────────────────────────────────────────────────────────────────────────

export const runtime = "nodejs";
export const maxDuration = 120;

const COST_PER_1K_INPUT  = 0.003;  // USD — Claude Sonnet approx
const COST_PER_1K_OUTPUT = 0.015;

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
      auth: { persistSession: false },
    }
  );
}

type Identity = {
  userId: string;
  companyId: string;
  token: string;
};

async function resolveIdentity(req: Request): Promise<Identity | null> {
  const authHeader = req.headers.get("authorization") || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!token) return null;

  try {
    // Use the user's own JWT — no service role needed for identity resolution
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

type EntitlementCheck = {
  allowed: boolean;
  reason?: string;
  code?: string;
  used?: number;
  limit?: number;
};

async function checkEntitlement(companyId: string, token: string): Promise<EntitlementCheck> {
  try {
    // Use the user's own JWT — covered by the members_read_own_entitlement SELECT policy
    const db = userClient(token);
    const { data: ent, error } = await db
      .from("company_entitlements")
      .select("ai_enabled, licence_type, subscription_status, ai_monthly_limit, ai_usage_this_month")
      .eq("company_id", companyId)
      .maybeSingle();

    if (error || !ent) {
      // No entitlement row — company has not been set up; deny by default
      return { allowed: false, reason: "AI access has not been configured for your account. Contact support.", code: "not_configured" };
    }

    if (!ent.ai_enabled) {
      return { allowed: false, reason: "AI features are not enabled for your account. Contact your administrator.", code: "ai_disabled" };
    }

    if (ent.licence_type === "suspended") {
      return { allowed: false, reason: "Your account has been suspended. Contact support.", code: "suspended" };
    }

    const activeStatuses = ["active", "trialing"];
    if (!activeStatuses.includes(ent.subscription_status)) {
      return {
        allowed: false,
        reason: `Your subscription is ${ent.subscription_status}. Update your billing to continue using AI features.`,
        code: "subscription_inactive",
      };
    }

    if (ent.ai_monthly_limit !== -1 && ent.ai_usage_this_month >= ent.ai_monthly_limit) {
      return {
        allowed: false,
        reason: "Your monthly AI allowance has been reached. Contact your administrator or wait for the next billing period.",
        code: "limit_reached",
        used: ent.ai_usage_this_month,
        limit: ent.ai_monthly_limit,
      };
    }

    return { allowed: true };
  } catch {
    // Entitlement check failure — fail open for internal accounts, fail closed otherwise
    return { allowed: false, reason: "Unable to verify AI access. Please try again.", code: "check_failed" };
  }
}

async function logUsage(
  companyId: string,
  userId: string,
  projectId: string | null,
  feature: string,
  model: string,
  inputTokens: number,
  outputTokens: number,
  estimatedCost: number
): Promise<void> {
  try {
    const db = adminClient();
    await db.from("ai_usage_logs").insert({
      company_id:     companyId,
      user_id:        userId,
      project_id:     projectId || null,
      feature,
      model,
      input_tokens:   inputTokens,
      output_tokens:  outputTokens,
      estimated_cost: estimatedCost,
      credits_used:   1,
    });
    // Increment the monthly usage counter on entitlements
    await db.rpc("increment_ai_usage", { p_company: companyId }).maybeSingle();
  } catch {
    // Usage logging is best-effort — never block the user over it
  }
}

export async function POST(req: Request) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: { message: "Invalid JSON body" } }, { status: 400 });
  }

  const { max_tokens = 4000, messages, meta } = body || {};
  if (!Array.isArray(messages)) {
    return NextResponse.json({ error: { message: "messages[] required" } }, { status: 400 });
  }

  // ── Step 1–2: Resolve identity ──────────────────────────────────────────────
  const identity = await resolveIdentity(req);
  if (!identity) {
    return NextResponse.json(
      { error: { message: "Authentication required. Please sign in.", code: "unauthenticated" } },
      { status: 401 }
    );
  }

  const { userId, companyId, token } = identity;
  const projectId = meta?.projectId || null;
  const feature   = String(meta?.kind || meta?.feature || "ai_takeoff");

  // ── Step 3–5: Check entitlement ─────────────────────────────────────────────
  // ai_scan is a cheap pre-flight classification — don't count it against limits
  const isScan = feature === "ai_scan";
  if (!isScan) {
    const check = await checkEntitlement(companyId, token);
    if (!check.allowed) {
      return NextResponse.json(
        { error: { message: check.reason, code: check.code, used: check.used, limit: check.limit } },
        { status: 402 }
      );
    }
  }

  // ── Also keep the legacy consume_credits RPC if it exists (backwards compat) ──
  // This keeps old code paths working during transition.
  if (!isScan) {
    try {
      const db = adminClient();
      await db.rpc("consume_credits", {
        p_company: companyId, p_user: userId,
        p_kind: feature, p_pages: meta?.pages || 0,
        p_input_tokens: 0, p_output_tokens: 0,
        p_est_cost: 0, p_credits: 1,
      });
    } catch {
      // RPC may not exist yet — non-fatal
    }
  }

  // ── AI call ─────────────────────────────────────────────────────────────────
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  const openaiKey    = process.env.OPENAI_API_KEY;

  try {
    if (anthropicKey) {
      const modelId = process.env.ANTHROPIC_MODEL || body.model || "claude-sonnet-4-20250514";
      const r = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": anthropicKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({ model: modelId, max_tokens, messages }),
      });
      const data = await r.json();

      // Log usage from response
      if (!isScan && r.ok) {
        const inTok  = data?.usage?.input_tokens  || 0;
        const outTok = data?.usage?.output_tokens || 0;
        const cost   = (inTok / 1000) * COST_PER_1K_INPUT + (outTok / 1000) * COST_PER_1K_OUTPUT;
        await logUsage(companyId, userId, projectId, feature, modelId, inTok, outTok, cost);
      }

      return NextResponse.json(data, { status: r.status });
    }

    if (openaiKey) {
      const modelId = process.env.OPENAI_MODEL || "gpt-4o";
      const client  = new OpenAI({ apiKey: openaiKey });
      const oaMessages = messages.map((m: any) => ({
        role: m.role,
        content: Array.isArray(m.content)
          ? m.content.map((b: any) =>
              b.type === "image"
                ? { type: "image_url", image_url: { url: `data:${b.source?.media_type || "image/jpeg"};base64,${b.source?.data}` } }
                : { type: "text", text: b.text || "" }
            )
          : String(m.content ?? ""),
      }));
      const resp = await client.chat.completions.create({
        model: modelId,
        max_completion_tokens: max_tokens,
        messages: oaMessages as any,
      });
      const text     = resp.choices?.[0]?.message?.content || "";
      const inTok    = resp.usage?.prompt_tokens    || 0;
      const outTok   = resp.usage?.completion_tokens || 0;
      const cost     = (inTok / 1000) * COST_PER_1K_INPUT + (outTok / 1000) * COST_PER_1K_OUTPUT;

      if (!isScan) {
        await logUsage(companyId, userId, projectId, feature, modelId, inTok, outTok, cost);
      }

      return NextResponse.json({ content: [{ type: "text", text }] });
    }

    return NextResponse.json(
      { error: { message: "No AI key configured. Add ANTHROPIC_API_KEY or OPENAI_API_KEY to .env.local.", code: "no_key" } },
      { status: 500 }
    );
  } catch (e: any) {
    return NextResponse.json({ error: { message: e?.message || "AI proxy error" } }, { status: 500 });
  }
}
