"use client";
// ─────────────────────────────────────────────────────────────────────────────
// BillingPage — Stripe placeholder.
// The entitlement architecture is fully built; this page shows the UI shell
// that Stripe will power once integrated. No Stripe calls are made here.
// ─────────────────────────────────────────────────────────────────────────────

const PLANS = [
  {
    id: "beta",
    name: "Beta",
    price: 0,
    description: "Free access during the closed beta period.",
    features: ["All core features", "AI Architectural Takeoff (limited)", "Up to 3 projects", "Email support"],
    highlight: false,
    badge: "Current",
  },
  {
    id: "starter",
    name: "Starter",
    price: 89,
    description: "For small cabinet shops and sole traders.",
    features: ["Unlimited projects", "AI Architectural Takeoff", "Cabinet Database", "Box Matrix", "Email support"],
    highlight: false,
    badge: null,
  },
  {
    id: "team",
    name: "Team",
    price: 149,
    description: "For growing workshops with multiple estimators.",
    features: ["Everything in Starter", "Up to 5 users", "Priority support", "Team collaboration"],
    highlight: true,
    badge: "Most Popular",
  },
  {
    id: "pro",
    name: "Pro",
    price: 229,
    description: "For high-volume commercial cabinet manufacturers.",
    features: ["Everything in Team", "Unlimited users", "Advanced reporting", "API access", "Dedicated support"],
    highlight: false,
    badge: null,
  },
];

export default function BillingPage({ entitlement, company, T }) {
  const currentPlan = entitlement?.licence_type === "internal"
    ? "internal"
    : (entitlement?.subscription_status === "active" ? "team" : "beta"); // placeholder

  const aiUsed  = entitlement?.ai_usage_this_month || 0;
  const aiLimit = entitlement?.ai_monthly_limit || 0;
  const aiPct   = aiLimit === -1 ? 0 : aiLimit > 0 ? Math.min(100, Math.round(aiUsed / aiLimit * 100)) : 0;

  const cardStyle = (hi) => ({
    background: hi ? T.accentDim : T.card,
    border: `2px solid ${hi ? T.accentBrd : T.border}`,
    borderRadius: 10, padding: 24,
    flex: 1, minWidth: 200,
    position: "relative",
  });

  const comingSoonBanner = (
    <div style={{
      background: "rgba(245,158,11,0.1)", border: "1px solid rgba(245,158,11,0.3)",
      borderRadius: 7, padding: "12px 16px", marginBottom: 24,
      display: "flex", alignItems: "center", gap: 10,
    }}>
      <span style={{ fontSize: 18 }}>⚡</span>
      <div>
        <div style={{ fontWeight: 700, fontSize: 13, color: T.amber || "#f59e0b" }}>Stripe integration coming soon</div>
        <div style={{ fontSize: 12, color: T.muted, marginTop: 2 }}>
          Billing will be handled through Stripe. Your plan and AI entitlements are already configured — upgrade will activate when Stripe is connected.
        </div>
      </div>
    </div>
  );

  return (
    <div style={{ maxWidth: 860, margin: "0 auto" }}>
      <div style={{ marginBottom: 28 }}>
        <div style={{ fontSize: 11, color: T.accent, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 8 }}>Billing</div>
        <div style={{ fontSize: 22, fontWeight: 800, color: T.text, marginBottom: 6 }}>Plan & Usage</div>
        <div style={{ fontSize: 13, color: T.muted }}>Manage your subscription, view AI usage, and access invoices.</div>
      </div>

      {comingSoonBanner}

      {/* ── Current Plan ── */}
      <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 10, padding: 22, marginBottom: 20 }}>
        <div style={{ fontSize: 11, color: T.faint, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 12 }}>Current Plan</div>
        <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
          <div style={{ flex: 1 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
              <span style={{ fontSize: 18, fontWeight: 800, color: T.accent }}>
                {entitlement?.licence_type === "internal" ? "Internal" :
                 entitlement?.billing_exempt ? "Beta" : "Free Trial"}
              </span>
              {entitlement?.billing_exempt && (
                <span style={{ background: "rgba(34,197,94,0.15)", color: "#22c55e", border: "1px solid rgba(34,197,94,0.3)", borderRadius: 4, padding: "2px 8px", fontSize: 11, fontWeight: 700 }}>
                  Billing Exempt
                </span>
              )}
              {entitlement?.licence_type === "internal" && (
                <span style={{ background: "rgba(245,158,11,0.15)", color: T.accent, border: "1px solid rgba(245,158,11,0.3)", borderRadius: 4, padding: "2px 8px", fontSize: 11, fontWeight: 700 }}>
                  Internal
                </span>
              )}
            </div>
            <div style={{ fontSize: 13, color: T.muted }}>
              Status: <span style={{ color: entitlement?.subscription_status === "active" ? "#22c55e" : T.muted, fontWeight: 600 }}>
                {entitlement?.subscription_status || "trialing"}
              </span>
            </div>
          </div>
          {entitlement?.licence_type !== "internal" && (
            <button style={{
              background: T.accent, color: "#000", border: "none", borderRadius: 6,
              padding: "10px 20px", fontWeight: 800, fontSize: 13, cursor: "not-allowed",
              opacity: 0.6,
            }} title="Coming soon">
              Upgrade Plan (Coming Soon)
            </button>
          )}
        </div>
      </div>

      {/* ── AI Usage ── */}
      <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 10, padding: 22, marginBottom: 20 }}>
        <div style={{ fontSize: 11, color: T.faint, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 12 }}>AI Usage — This Month</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16, marginBottom: 14 }}>
          <div>
            <div style={{ fontSize: 10, color: T.faint, marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.06em" }}>Used</div>
            <div style={{ fontSize: 24, fontWeight: 800, color: T.text, fontFamily: "monospace" }}>{aiUsed}</div>
          </div>
          <div>
            <div style={{ fontSize: 10, color: T.faint, marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.06em" }}>Limit</div>
            <div style={{ fontSize: 24, fontWeight: 800, color: T.text, fontFamily: "monospace" }}>
              {aiLimit === -1 ? "∞" : aiLimit}
            </div>
          </div>
          <div>
            <div style={{ fontSize: 10, color: T.faint, marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.06em" }}>AI Access</div>
            <div style={{ fontSize: 14, fontWeight: 800, color: entitlement?.ai_enabled ? "#22c55e" : "#ef4444" }}>
              {entitlement?.ai_enabled ? "✓ Enabled" : "✗ Disabled"}
            </div>
          </div>
        </div>
        {aiLimit !== -1 && aiLimit > 0 && (
          <>
            <div style={{ background: T.bg, borderRadius: 4, height: 6, overflow: "hidden", marginBottom: 6 }}>
              <div style={{
                height: "100%", borderRadius: 4, transition: "width 0.4s",
                background: aiPct >= 90 ? "#ef4444" : aiPct >= 70 ? "#d97706" : "#22c55e",
                width: `${aiPct}%`,
              }} />
            </div>
            <div style={{ fontSize: 11, color: T.faint }}>{aiPct}% of monthly allowance used</div>
          </>
        )}
        {aiLimit === -1 && (
          <div style={{ fontSize: 12, color: "#22c55e" }}>Unlimited AI usage — internal account</div>
        )}
      </div>

      {/* ── Plans comparison ── */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: T.text, marginBottom: 16 }}>Available Plans</div>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          {PLANS.map(plan => (
            <div key={plan.id} style={cardStyle(plan.highlight)}>
              {plan.badge && (
                <div style={{
                  position: "absolute", top: -10, left: "50%", transform: "translateX(-50%)",
                  background: plan.highlight ? T.accent : T.card2, color: plan.highlight ? "#000" : T.muted,
                  borderRadius: 10, padding: "2px 12px", fontSize: 11, fontWeight: 700,
                  border: `1px solid ${plan.highlight ? T.accentBrd : T.border}`,
                  whiteSpace: "nowrap",
                }}>
                  {plan.badge}
                </div>
              )}
              <div style={{ fontSize: 16, fontWeight: 800, color: T.text, marginBottom: 4 }}>{plan.name}</div>
              <div style={{ fontSize: 24, fontWeight: 900, color: plan.highlight ? T.accent : T.text, marginBottom: 4, fontFamily: "monospace" }}>
                {plan.price === 0 ? "Free" : `$${plan.price}`}
                {plan.price > 0 && <span style={{ fontSize: 13, fontWeight: 400, color: T.muted }}>/mo AUD</span>}
              </div>
              <div style={{ fontSize: 12, color: T.muted, marginBottom: 14 }}>{plan.description}</div>
              <ul style={{ listStyle: "none", padding: 0, margin: "0 0 16px", display: "flex", flexDirection: "column", gap: 5 }}>
                {plan.features.map((f, i) => (
                  <li key={i} style={{ fontSize: 12, color: T.text, display: "flex", gap: 6 }}>
                    <span style={{ color: T.green || "#22c55e" }}>✓</span>{f}
                  </li>
                ))}
              </ul>
              <button
                style={{
                  width: "100%", background: plan.highlight ? T.accent : T.card2,
                  color: plan.highlight ? "#000" : T.muted,
                  border: `1px solid ${plan.highlight ? T.accentBrd : T.border}`,
                  borderRadius: 6, padding: "9px 0", fontWeight: 700, fontSize: 13,
                  cursor: "not-allowed", opacity: 0.65,
                }}
                title="Stripe integration coming soon">
                Coming Soon
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* ── Invoice history ── */}
      <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 10, padding: 22, marginBottom: 20 }}>
        <div style={{ fontSize: 11, color: T.faint, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 12 }}>Invoice History</div>
        <div style={{ textAlign: "center", padding: "24px 0", color: T.faint, fontSize: 13 }}>
          No invoices yet. Invoice history will appear here once Stripe is connected.
        </div>
      </div>

      {/* ── Contact ── */}
      <div style={{ fontSize: 12, color: T.faint, textAlign: "center", lineHeight: 1.7 }}>
        Questions about billing?{" "}
        <span style={{ color: T.accent }}>Contact us at support@verixo.com.au</span>
        {" · "}Verixo is a product by Shilacon Pty Ltd
      </div>
    </div>
  );
}
