import { NextResponse } from "next/server";
import OpenAI from "openai";

// QuantaFlow AI proxy — the API key lives HERE on the server, never in the browser.
// Configure ONE of these in .env.local (then restart `npm run dev`):
//   ANTHROPIC_API_KEY=sk-ant-...   (preferred — the takeoff prompts were tuned on Claude)
//   OPENAI_API_KEY=sk-proj-...     (works via automatic format adaptation to gpt-4o vision)
// Optional overrides: ANTHROPIC_MODEL, OPENAI_MODEL

export const runtime = "nodejs";
export const maxDuration = 120; // takeoff batches with large images can take a while

export async function POST(req: Request) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: { message: "Invalid JSON body" } }, { status: 400 });
  }
  const { max_tokens = 2000, messages } = body || {};
  if (!Array.isArray(messages)) {
    return NextResponse.json({ error: { message: "messages[] required" } }, { status: 400 });
  }

  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  const openaiKey = process.env.OPENAI_API_KEY;

  try {
    // ── Path 1: Anthropic — native passthrough (request is already in this format)
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

    // ── Path 2: OpenAI — adapt Anthropic-style image/text blocks to OpenAI vision format
    if (openaiKey) {
      const client = new OpenAI({ apiKey: openaiKey });
      const oaMessages = messages.map((m: any) => ({
        role: m.role,
        content: Array.isArray(m.content)
          ? m.content.map((b: any) =>
              b.type === "image"
                ? {
                    type: "image_url",
                    image_url: {
                      url: `data:${b.source?.media_type || "image/jpeg"};base64,${b.source?.data}`,
                    },
                  }
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
      // Return in the Anthropic-style shape the frontend expects
      return NextResponse.json({ content: [{ type: "text", text }] });
    }

    return NextResponse.json(
      {
        error: {
          message:
            "No AI key configured. Add ANTHROPIC_API_KEY or OPENAI_API_KEY to .env.local (NOT .env.local.txt) and restart the dev server.",
        },
      },
      { status: 500 }
    );
  } catch (e: any) {
    return NextResponse.json(
      { error: { message: e?.message || "AI proxy error" } },
      { status: 500 }
    );
  }
}
