"use client";
import { useState, useEffect } from "react";
import { supabase } from "../../lib/supabase";

// ─────────────────────────────────────────────────────────────────────────────
// AI Credit → Business Language Conversion
// These estimates are based on observed token usage per task type.
// Displayed externally as "capacity" — never show raw token counts.
// ─────────────────────────────────────────────────────────────────────────────
const CREDITS_PER_KITCHEN    = 6;    // ~1 full kitchen takeoff + estimate
const CREDITS_PER_APARTMENT  = 18;   // ~1 apartment unit (all rooms)
const CREDITS_PER_CABINET    = 0.9;  // ~1 cabinet AI extraction

function aiCapacity(remaining) {
  if (remaining <= 0) return null;
  return {
    kitchens:   Math.floor(remaining / CREDITS_PER_KITCHEN),
    apartments: Math.floor(remaining / CREDITS_PER_APARTMENT),
    cabinets:   Math.floor(remaining / CREDITS_PER_CABINET),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Plan Definitions
// Unlimited users on every plan — differentiated by AI credits and features.
// ─────────────────────────────────────────────────────────────────────────────
const PLANS = [
  {
    id: "beta",
    name: "Beta",
    price: 0,
    aiCredits: 100,
    priceLabel: "Free",
    description: "Full access during closed beta testing.",
    features: [
      "Unlimited users",
      "Unlimited projects",
      "All core modules",
      "100 AI credits / month",
      "Manual & AI estimating",
      "Email support",
    ],
    highlight: false,
    badge: null,
  },
  {
    id: "starter",
    name: "Starter",
    price: 89,
    aiCredits: 300,
    priceLabel: "$89 AUD / month",
    description: "For small cabinet shops getting started.",
    features: [
      "Unlimited users",
      "Unlimited projects",
      "All core modules",
      "300 AI credits / month",
      "Manual & AI estimating",
      "Cabinet database",
      "Box Matrix",
      "Email support",
    ],
    highlight: false,
    badge: null,
  },
  {
    id: "pro",
    name: "Pro",
    price: 149,
    aiCredits: 1000,
    priceLabel: "$149 AUD / month",
    description: "For active estimating teams.",
    features: [
      "Unlimited users",
      "Unlimited projects",
      "All core modules",
      "1,000 AI credits / month",
      "Priority AI processing",
      "Advanced reporting",
      "Priority email support",
    ],
    highlight: true,
    badge: "Most Popular",
  },
  {
    id: "studio",
    name: "Studio",
    price: 229,
    aiCredits: 3000,
    priceLabel: "$229 AUD / month",
    description: "For high-volume commercial manufacturers.",
    features: [
      "Unlimited users",
      "Unlimited projects",
      "All core modules",
      "3,000 AI credits / month",
      "Highest priority AI",
      "Advanced reporting & exports",
      "Dedicated account support",
    ],
    highlight: false,
    badge: null,
  },
  {
    id: "enterprise",
    name: "Enterprise",
    price: null,
    aiCredits: -1,
    priceLabel: "Custom pricing",
    description: "Tailored for large organisations.",
    features: [
      "Custom AI credit allocation",
      "Custom integrations",
      "On-site training",
      "SLA agreement",
      "White-glove support",
    ],
    highlight: false,
    badge: null,
  },
];

const PLAN_BY_ID = Object.fromEntries(PLANS.map(p => [p.id, p]));

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────
export default function BillingPage({ entitlement, company, companyId, T, pop, userRole, onChangePlan, onBuyCredits, onCancelPlan }) {
  const [planData, setPlanData] = useState(null);
  const [pendingReq, setPendingReq] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!companyId) return;
    let mounted = true;
    (async () => {
      const now = new Date();
      const monthStart = `${now.getUTCFullYear()}-${String(now.getUTCMonth()+1).padStart(2,"0")}-01T00:00:00Z`;
      const [compRes, usageRes, reqRes] = await Promise.all([
        supabase.from("companies").select("plan,ai_monthly_limit,ai_credits_extra").eq("id", companyId).maybeSingle(),
        supabase.from("ai_usage").select("credits").gte("created_at", monthStart),
        supabase.from("plan_change_requests").select("*").eq("company_id", companyId).eq("status", "pending")
          .order("requested_at", { ascending: false }).limit(1).maybeSingle(),
      ]);
      if (!mounted) return;
      const creditsUsed = (usageRes.data || []).reduce((s, r) => s + (r.credits || 0), 0);
      const rawLimit = compRes.data?.ai_monthly_limit ?? 100;
      const limit = rawLimit < 0 ? -1 : rawLimit + (compRes.data?.ai_credits_extra || 0);
      setPlanData({ plan: compRes.data?.plan || "beta", limit, creditsUsed });
      setPendingReq(reqRes.data || null);
      setLoading(false);
    })();
    return () => { mounted = false; };
  }, [companyId]);

  const isInternal  = entitlement?.licence_type === "internal";
  const aiEnabled   = entitlement?.ai_enabled ?? false;
  const aiUsed      = planData?.creditsUsed ?? entitlement?.ai_usage_this_month ?? 0;
  const aiLimit     = planData?.limit ?? entitlement?.ai_monthly_limit ?? 0;
  const aiRemaining = aiLimit === -1 ? Infinity : Math.max(0, aiLimit - aiUsed);
  const aiPct       = aiLimit === -1 || aiLimit === 0 ? 0 : Math.min(100, Math.round(aiUsed / aiLimit * 100));
  const capacity    = aiLimit === -1 ? { kitchens: "∞", apartments: "∞", cabinets: "∞" } : aiCapacity(aiRemaining);
  const currentPlan = planData?.plan ?? "beta";
  const planDef     = PLAN_BY_ID[currentPlan];
  const renewDate   = (() => { const d = new Date(); d.setUTCMonth(d.getUTCMonth()+1); d.setUTCDate(1); return d; })();

  const s = (extra = {}) => ({
    background: T.card, border: `1px solid ${T.border}`, borderRadius: 10, padding: 22, marginBottom: 18,
    ...extra,
  });

  const barColor = aiPct >= 90 ? "#ef4444" : aiPct >= 70 ? "#d97706" : "#22c55e";

  if (loading) return (
    <div style={{ maxWidth: 860, margin: "0 auto", padding: 40, textAlign: "center", color: T.muted, fontSize: 14 }}>
      Loading billing information…
    </div>
  );

  return (
    <div style={{ maxWidth: 880, margin: "0 auto", paddingBottom: 40 }}>

      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ fontSize: 11, color: T.accent, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 6 }}>Billing</div>
        <div style={{ fontSize: 22, fontWeight: 800, color: T.text, marginBottom: 6 }}>Subscription & AI Credits</div>
        <div style={{ fontSize: 13, color: T.muted }}>Manage your plan, monitor AI usage, and access invoices.</div>
      </div>

      {/* Stripe coming soon banner */}
      <div style={{ background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.25)", borderRadius: 8, padding: "12px 16px", marginBottom: 22, display: "flex", alignItems: "center", gap: 12 }}>
        <span style={{ fontSize: 20 }}>⚡</span>
        <div>
          <div style={{ fontWeight: 700, fontSize: 13, color: T.accent }}>Stripe payments launching soon</div>
          <div style={{ fontSize: 12, color: T.muted, marginTop: 2 }}>
            Your subscription and AI entitlements are already configured. Payment processing will activate when Stripe is connected — no action needed.
          </div>
        </div>
      </div>

      {/* Current Plan */}
      <div style={s()}>
        <div style={{ fontSize: 11, color: T.faint, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 14 }}>Current Plan</div>

        <div style={{ display: "flex", alignItems: "flex-start", gap: 16, flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 220 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6, flexWrap: "wrap" }}>
              <span style={{ fontSize: 20, fontWeight: 900, color: T.accent }}>
                {isInternal ? "Internal" : (planDef?.name ?? currentPlan)}
              </span>
              {isInternal && (
                <span style={{ background: "rgba(245,158,11,0.15)", color: T.accent, border: "1px solid rgba(245,158,11,0.3)", borderRadius: 5, padding: "2px 10px", fontSize: 11, fontWeight: 700 }}>
                  Internal Licence
                </span>
              )}
              {entitlement?.billing_exempt && !isInternal && (
                <span style={{ background: "rgba(34,197,94,0.12)", color: "#22c55e", border: "1px solid rgba(34,197,94,0.3)", borderRadius: 5, padding: "2px 10px", fontSize: 11, fontWeight: 700 }}>
                  Billing Exempt
                </span>
              )}
              <span style={{
                background: entitlement?.subscription_status === "active" ? "rgba(34,197,94,0.12)" : "rgba(100,116,139,0.15)",
                color: entitlement?.subscription_status === "active" ? "#22c55e" : T.muted,
                border: `1px solid ${entitlement?.subscription_status === "active" ? "rgba(34,197,94,0.3)" : T.border}`,
                borderRadius: 5, padding: "2px 10px", fontSize: 11, fontWeight: 700,
              }}>
                {entitlement?.subscription_status === "active" ? "Active" : entitlement?.subscription_status ?? "Trial"}
              </span>
            </div>
            <div style={{ fontSize: 13, color: T.muted, marginBottom: 4 }}>
              {isInternal ? "Unlimited AI — internal testing account" : planDef?.description ?? "Closed beta access"}
            </div>
            {!isInternal && (
              <div style={{ fontSize: 12, color: T.faint }}>
                Renews {renewDate.toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric" })}
                {" · "}{isInternal ? "No charge" : planDef?.priceLabel ?? "Free"}
              </div>
            )}
          </div>
          {!isInternal && userRole === "owner" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {pendingReq && (
                <div style={{ fontSize: 12, color: T.yellow, background: "rgba(234,179,8,0.1)", border: "1px solid rgba(234,179,8,0.3)", borderRadius: 6, padding: "6px 10px", marginBottom: 4 }}>
                  ⏳ Plan change to <strong>{pendingReq.requested_plan}</strong> pending
                </div>
              )}
              <button onClick={onChangePlan}
                style={{ background: T.accent, color: "#000", border: "none", borderRadius: 7, padding: "9px 18px", fontWeight: 800, fontSize: 13, cursor: "pointer" }}>
                Upgrade Plan
              </button>
              <button onClick={onBuyCredits}
                style={{ background: "transparent", color: T.teal, border: `1px solid ${T.teal}55`, borderRadius: 7, padding: "8px 18px", fontWeight: 700, fontSize: 12, cursor: "pointer" }}>
                ⚡ Buy Extra AI Credits
              </button>
            </div>
          )}
        </div>
      </div>

      {/* AI Credit Usage */}
      <div style={s()}>
        <div style={{ fontSize: 11, color: T.faint, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 14 }}>AI Credits — This Month</div>

        {!aiEnabled ? (
          <div style={{ padding: "16px 0", color: T.muted, fontSize: 13 }}>
            AI is not enabled on this account. Contact support to discuss AI access.
          </div>
        ) : (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 16, marginBottom: 18 }}>
              <div style={{ background: T.bg, borderRadius: 8, padding: "12px 14px" }}>
                <div style={{ fontSize: 10, color: T.faint, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>Used</div>
                <div style={{ fontSize: 22, fontWeight: 800, color: T.text, fontFamily: "monospace" }}>{aiUsed.toLocaleString()}</div>
              </div>
              <div style={{ background: T.bg, borderRadius: 8, padding: "12px 14px" }}>
                <div style={{ fontSize: 10, color: T.faint, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>Monthly Limit</div>
                <div style={{ fontSize: 22, fontWeight: 800, color: T.text, fontFamily: "monospace" }}>{aiLimit === -1 ? "∞" : aiLimit.toLocaleString()}</div>
              </div>
              <div style={{ background: T.bg, borderRadius: 8, padding: "12px 14px" }}>
                <div style={{ fontSize: 10, color: T.faint, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>Remaining</div>
                <div style={{ fontSize: 22, fontWeight: 800, color: aiPct >= 90 ? "#ef4444" : aiPct >= 70 ? "#d97706" : "#22c55e", fontFamily: "monospace" }}>
                  {aiLimit === -1 ? "∞" : (aiLimit - aiUsed).toLocaleString()}
                </div>
              </div>
            </div>

            {aiLimit !== -1 && aiLimit > 0 && (
              <>
                <div style={{ background: T.bg, borderRadius: 6, height: 8, overflow: "hidden", marginBottom: 6 }}>
                  <div style={{ height: "100%", borderRadius: 6, background: barColor, width: `${aiPct}%`, transition: "width 0.4s" }} />
                </div>
                <div style={{ fontSize: 11, color: T.faint, marginBottom: 16 }}>{aiPct}% of this month's allowance used · resets 1st of each month</div>
              </>
            )}

            {/* Business language capacity estimate */}
            {capacity && (
              <div style={{ background: T.bg, borderRadius: 8, padding: "14px 16px", border: `1px solid ${T.border}` }}>
                <div style={{ fontSize: 11, color: T.muted, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10 }}>
                  Estimated Remaining Capacity
                </div>
                <div style={{ fontSize: 13, color: T.faint, marginBottom: 10 }}>Approximately:</div>
                <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
                  {[
                    { count: capacity.kitchens, label: "Kitchen estimates" },
                    { count: capacity.apartments, label: "Apartment unit takeoffs" },
                    { count: capacity.cabinets, label: "Individual cabinet extractions" },
                  ].map(({ count, label }) => (
                    <div key={label} style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
                      <span style={{ fontSize: 22, fontWeight: 900, color: T.accent, fontFamily: "monospace" }}>
                        {typeof count === "number" ? count.toLocaleString() : count}
                      </span>
                      <span style={{ fontSize: 12, color: T.muted }}>{label}</span>
                    </div>
                  ))}
                </div>
                <div style={{ fontSize: 11, color: T.faint, marginTop: 10, lineHeight: 1.6 }}>
                  Estimates based on typical AI task complexity. Actual usage may vary by drawing quality and project size.
                </div>
              </div>
            )}

            {aiLimit === -1 && (
              <div style={{ padding: "12px 14px", background: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.2)", borderRadius: 8 }}>
                <div style={{ fontSize: 13, color: "#22c55e", fontWeight: 700 }}>Unlimited AI credits — internal account</div>
                <div style={{ fontSize: 12, color: T.muted, marginTop: 4 }}>All AI features are fully available with no usage cap.</div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Plan comparison */}
      <div style={{ marginBottom: 18 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: T.text, marginBottom: 4 }}>Available Plans</div>
        <div style={{ fontSize: 12, color: T.faint, marginBottom: 16 }}>
          All plans include unlimited users, unlimited projects, and the full feature set. Plans differ in AI credit allocation and support level.
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(190px, 1fr))", gap: 12 }}>
          {PLANS.filter(p => p.id !== "internal").map(plan => {
            const isCurrent = plan.id === currentPlan;
            return (
              <div key={plan.id} style={{
                background: plan.highlight ? T.accentDim : T.card,
                border: `2px solid ${isCurrent ? T.accent : plan.highlight ? T.accentBrd : T.border}`,
                borderRadius: 10, padding: 18, position: "relative",
                boxShadow: isCurrent ? `0 0 0 1px ${T.accent}44` : "none",
              }}>
                {plan.badge && (
                  <div style={{ position: "absolute", top: -10, left: "50%", transform: "translateX(-50%)", background: T.accent, color: "#000", borderRadius: 10, padding: "2px 12px", fontSize: 11, fontWeight: 800, whiteSpace: "nowrap" }}>
                    {plan.badge}
                  </div>
                )}
                {isCurrent && !plan.badge && (
                  <div style={{ position: "absolute", top: -10, left: "50%", transform: "translateX(-50%)", background: T.card, color: T.accent, border: `1px solid ${T.accent}`, borderRadius: 10, padding: "2px 12px", fontSize: 11, fontWeight: 800, whiteSpace: "nowrap" }}>
                    Current
                  </div>
                )}
                <div style={{ fontSize: 15, fontWeight: 800, color: T.text, marginBottom: 4 }}>{plan.name}</div>
                <div style={{ fontSize: 13, fontWeight: 700, color: plan.highlight ? T.accent : T.text, marginBottom: 4 }}>
                  {plan.priceLabel}
                </div>
                <div style={{ fontSize: 11, color: T.faint, marginBottom: 10, lineHeight: 1.5 }}>{plan.description}</div>
                {plan.aiCredits !== null && (
                  <div style={{ fontSize: 12, color: T.muted, background: T.bg, borderRadius: 5, padding: "5px 8px", marginBottom: 12, fontWeight: 600 }}>
                    {plan.aiCredits === -1 ? "∞ Unlimited AI credits" : `${plan.aiCredits.toLocaleString()} AI credits / mo`}
                  </div>
                )}
                <ul style={{ listStyle: "none", padding: 0, margin: "0 0 14px", display: "flex", flexDirection: "column", gap: 4 }}>
                  {plan.features.map((f, i) => (
                    <li key={i} style={{ fontSize: 11, color: T.text, display: "flex", gap: 6 }}>
                      <span style={{ color: "#22c55e", flexShrink: 0 }}>✓</span>{f}
                    </li>
                  ))}
                </ul>
                <button
                  onClick={plan.id === "enterprise" ? undefined : onChangePlan}
                  disabled={isCurrent || plan.id === "enterprise"}
                  style={{
                    width: "100%",
                    background: isCurrent ? "transparent" : plan.highlight ? T.accent : T.bg,
                    color: isCurrent ? T.faint : plan.highlight ? "#000" : T.muted,
                    border: `1px solid ${isCurrent ? T.border : plan.highlight ? "transparent" : T.border}`,
                    borderRadius: 6, padding: "8px 0", fontWeight: 700, fontSize: 12,
                    cursor: isCurrent || plan.id === "enterprise" ? "default" : "pointer",
                    opacity: isCurrent ? 0.5 : 1,
                  }}>
                  {isCurrent ? "Current Plan" : plan.id === "enterprise" ? "Contact Us" : "Upgrade (Coming Soon)"}
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* Cancel subscription — owner only, non-free plan */}
      {userRole === "owner" && !isInternal && currentPlan !== "beta" && (
        <div style={s({ background: "transparent", border: `1px solid ${T.border}44` })}>
          <div style={{ fontSize: 12, color: T.faint }}>
            Need to cancel?{" "}
            <button onClick={onCancelPlan}
              style={{ background: "none", border: "none", color: T.muted, fontSize: 12, cursor: "pointer", padding: 0, textDecoration: "underline" }}>
              Cancel subscription
            </button>
            {" "}— your access continues until the end of the billing period.
          </div>
        </div>
      )}

      {/* Invoice history */}
      <div style={s()}>
        <div style={{ fontSize: 11, color: T.faint, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 14 }}>Invoice History</div>
        <div style={{ textAlign: "center", padding: "28px 0", color: T.faint, fontSize: 13 }}>
          <div style={{ fontSize: 20, marginBottom: 8 }}>📄</div>
          <div>No invoices yet.</div>
          <div style={{ fontSize: 12, marginTop: 4 }}>Invoice history will appear here once Stripe is connected.</div>
        </div>
      </div>

      {/* Contact */}
      <div style={{ fontSize: 12, color: T.faint, textAlign: "center", lineHeight: 1.8 }}>
        Questions about billing? Email{" "}
        <a href="mailto:support@verixo.com.au" style={{ color: T.accent }}>support@verixo.com.au</a>
        {" · "}Verixo is a product by Shilacon Pty Ltd · ABN to be added
      </div>
    </div>
  );
}
