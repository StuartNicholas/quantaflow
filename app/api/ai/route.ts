import { NextResponse } from "next/server";
import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";

// Verixo AI proxy + usage metering.
// The API key and the Supabase SERVICE-ROLE key live HERE on the server only.
//
// .env.local (and Vercel → Settings → Environment Variables) must contain:
//   ANTHROPIC_API_KEY=sk-ant-...           (or OPENAI_API_KEY=sk-proj-...)
//   NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
//   SUPABASE_SERVICE_ROLE_KEY=eyJ...        (Supabase → Settings → API → service_role; NEVER expose to the browser)
//
// The browser sends the user's access token in the Authorization header so we
// can identify the company and meter against it.

export const runtime = "nodejs";
export const maxDuration = 120;

// Rough cost model — tune to your real provider pricing. Used for est_cost only;
// "credits" is what you actually meter/charge on (1 credit ≈ 1 page analysed).
const COST_PER_PAGE_USD = 0.06;

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

export async function POST(req: Request) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: { message: "Invalid JSON body" } }, { status: 400 });
  }
  const { max_tokens = 2000, messages, meta } = body || {};
  if (!Array.isArray(messages)) {
    return NextResponse.json({ error: { message: "messages[] required" } }, { status: 400 });
  }

  // ── Identify the caller's company (for metering). Non-fatal if it fails:
  //    we still run the AI, we just can't meter — better than blocking a tester.
  let companyId: string | null = null;
  let userId: string | null = null;
  const supaUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const authHeader = req.headers.get("authorization") || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";

  if (supaUrl && serviceKey && token) {
    try {
      const db = admin();
      const { data: userData } = await db.auth.getUser(token);
      userId = userData?.user?.id ?? null;
      if (userId) {
        const { data: profile } = await db
          .from("profiles")
          .select("company_id")
          .eq("id", userId)
          .single();
        companyId = profile?.company_id ?? null;
      }
    } catch {
      /* metering unavailable — continue */
    }
  }

  const pages = Math.max(0, Number(meta?.pages) || 0);
  const kind = String(meta?.kind || "ai_takeoff");
  // Phase 1 scans (kind="ai_scan") are cheap classification passes — don't consume credits.
  // Only Phase 2 extractions (kind="ai_takeoff") count against the company's allowance.
  const credits = kind === "ai_scan" ? 0 : Math.max(1, pages || 1);

  // ── Pre-flight limit check (only blocks if the company's plan has hard_block on)
  if (companyId && supaUrl && serviceKey) {
    try {
      const db = admin();
      const { data: check } = await db.rpc("consume_credits", {
        p_company: companyId,
        p_user: userId,
        p_kind: kind,
        p_pages: pages,
        p_input_tokens: 0,
        p_output_tokens: 0,
        p_est_cost: pages * COST_PER_PAGE_USD,
        p_credits: credits,
      });
      if (check && check.allowed === false) {
        return NextResponse.json(
          {
            error: {
              message:
                "Your plan's monthly AI takeoff allowance has been reached. Upgrade your plan or wait for the next billing period.",
              code: "limit_reached",
              used: check.used,
              limit: check.limit,
            },
          },
          { status: 402 }
        );
      }
    } catch {
      /* metering failed — do not block the user over a metering error */
    }
  }

  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  const openaiKey = process.env.OPENAI_API_KEY;

  try {
    if (anthropicKey) {
      const r = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": anthropicKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: process.env.ANTHROPIC_MODEL || body.model || "claude-sonnet-4-20250514",
          max_tokens,
          messages,
        }),
      });
      const data = await r.json();
      return NextResponse.json(data, { status: r.status });
    }

    if (openaiKey) {
      const client = new OpenAI({ apiKey: openaiKey });
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
        model: process.env.OPENAI_MODEL || "gpt-4o",
        max_completion_tokens: max_tokens,
        messages: oaMessages as any,
      });
      const text = resp.choices?.[0]?.message?.content || "";
      return NextResponse.json({ content: [{ type: "text", text }] });
    }

    return NextResponse.json(
      { error: { message: "No AI key configured. Add ANTHROPIC_API_KEY or OPENAI_API_KEY to .env.local and restart." } },
      { status: 500 }
    );
  } catch (e: any) {
    return NextResponse.json({ error: { message: e?.message || "AI proxy error" } }, { status: 500 });
  }
}