"use client";
// ─────────────────────────────────────────────────────────────────────────────
// Shilacon Administration — internal only.
// Access: verified by email server-side (the API refuses non-admins).
// The UI also hides itself, but security lives in /api/admin.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";

const C = {
  bg: "#07090c", panel: "#0d1117", card: "#101820", card2: "#141e2a", faint: "#1e2d3d",
  border: "#1e293b", text: "#f1f5f9", muted: "#64748b",
  green: "#22c55e", yellow: "#f59e0b", red: "#ef4444", blue: "#3b82f6", teal: "#14b8a6",
  purple: "#8b5cf6",
};

const LICENCE_TYPES = ["internal", "beta", "paid", "suspended"] as const;
const SUB_STATUSES  = ["active", "trialing", "past_due", "cancelled", "paused"] as const;

const LICENCE_COLOR: Record<string, string> = {
  internal: C.yellow, beta: C.blue, paid: C.green, suspended: C.red,
};
const SUB_COLOR: Record<string, string> = {
  active: C.green, trialing: C.blue, past_due: C.yellow, cancelled: C.red, paused: C.muted,
};

function Card({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, ...style }}>{children}</div>;
}

function KPI({ label, value, sub, color }: { label: string; value: string | number; sub?: string; color?: string }) {
  return (
    <Card style={{ flex: 1, minWidth: 130, padding: 18 }}>
      <div style={{ color: C.muted, fontSize: 10, textTransform: "uppercase", letterSpacing: 1, marginBottom: 6, fontWeight: 700 }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 900, color: color || C.text, lineHeight: 1, fontFamily: "monospace" }}>{value}</div>
      {sub && <div style={{ color: C.muted, fontSize: 11, marginTop: 5 }}>{sub}</div>}
    </Card>
  );
}

function Badge({ label, color }: { label: string; color: string }) {
  return (
    <span style={{ background: `${color}22`, color, border: `1px solid ${color}44`, borderRadius: 4, padding: "2px 8px", fontSize: 11, fontWeight: 700 }}>
      {label}
    </span>
  );
}

// ── Entitlement editor panel ──────────────────────────────────────────────────

function EntitlementEditor({ company, ent, onSave, onClose, saveErr }: { company: any; ent: any; onSave: (patch: any) => Promise<void>; onClose: () => void; saveErr?: string | null }) {
  const [form, setForm] = React.useState({
    licenceType:        ent?.licence_type        || "beta",
    billingExempt:      ent?.billing_exempt      ?? false,
    subscriptionStatus: ent?.subscription_status || "trialing",
    aiEnabled:          ent?.ai_enabled          ?? false,
    aiMonthlyLimit:     ent?.ai_monthly_limit    ?? 0,
  });
  const [saving, setSaving] = React.useState(false);
  const set = (k: string, v: any) => setForm(f => ({ ...f, [k]: v }));

  const inputStyle = {
    width: "100%", boxSizing: "border-box" as const,
    background: "#0f172a", color: C.text, border: `1px solid ${C.border}`,
    borderRadius: 7, padding: "9px 12px", fontSize: 13,
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.8)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999 }}>
      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: 28, width: 500, maxWidth: "92vw" }}>
        <div style={{ fontWeight: 800, fontSize: 17, marginBottom: 4, color: C.text }}>{company.name}</div>
        <div style={{ color: C.muted, fontSize: 12, marginBottom: 22 }}>Entitlement Configuration</div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 18 }}>
          <div>
            <label style={{ color: C.muted, fontSize: 11, display: "block", marginBottom: 5, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase" }}>Licence Type</label>
            <select value={form.licenceType} onChange={e => set("licenceType", e.target.value)} style={{ ...inputStyle, cursor: "pointer" }}>
              {LICENCE_TYPES.map(t => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
            </select>
          </div>
          <div>
            <label style={{ color: C.muted, fontSize: 11, display: "block", marginBottom: 5, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase" }}>Subscription Status</label>
            <select value={form.subscriptionStatus} onChange={e => set("subscriptionStatus", e.target.value)} style={{ ...inputStyle, cursor: "pointer" }}>
              {SUB_STATUSES.map(s => <option key={s} value={s}>{s.replace(/_/g, " ").replace(/\b\w/g, l => l.toUpperCase())}</option>)}
            </select>
          </div>
          <div>
            <label style={{ color: C.muted, fontSize: 11, display: "block", marginBottom: 5, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase" }}>AI Monthly Limit (-1 = unlimited)</label>
            <input type="number" min={-1} value={form.aiMonthlyLimit} onChange={e => set("aiMonthlyLimit", parseInt(e.target.value) || 0)} style={inputStyle} />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10, paddingTop: 20 }}>
            <label style={{ display: "flex", gap: 9, alignItems: "center", cursor: "pointer", fontSize: 13, color: C.text }}>
              <input type="checkbox" checked={form.aiEnabled} onChange={e => set("aiEnabled", e.target.checked)}
                style={{ width: 16, height: 16, cursor: "pointer", accentColor: C.green }} />
              AI Enabled
            </label>
            <label style={{ display: "flex", gap: 9, alignItems: "center", cursor: "pointer", fontSize: 13, color: C.text }}>
              <input type="checkbox" checked={form.billingExempt} onChange={e => set("billingExempt", e.target.checked)}
                style={{ width: 16, height: 16, cursor: "pointer", accentColor: C.yellow }} />
              Billing Exempt
            </label>
          </div>
        </div>

        {/* Preview */}
        <div style={{ background: C.faint, borderRadius: 8, padding: "12px 14px", marginBottom: 20, fontSize: 12, lineHeight: 1.8 }}>
          <div style={{ color: C.muted, marginBottom: 4, fontWeight: 700, fontSize: 11 }}>EFFECT</div>
          <div><span style={{ color: C.muted }}>Licence: </span><span style={{ color: LICENCE_COLOR[form.licenceType] || C.text, fontWeight: 700 }}>{form.licenceType}</span></div>
          <div><span style={{ color: C.muted }}>AI Access: </span><span style={{ color: form.aiEnabled ? C.green : C.red, fontWeight: 700 }}>{form.aiEnabled ? "Enabled" : "Disabled"}</span></div>
          <div><span style={{ color: C.muted }}>Monthly AI Limit: </span><span style={{ color: C.text, fontFamily: "monospace" }}>{form.aiMonthlyLimit === -1 ? "Unlimited" : form.aiMonthlyLimit}</span></div>
          <div><span style={{ color: C.muted }}>Billing Exempt: </span><span style={{ color: form.billingExempt ? C.yellow : C.muted }}>{form.billingExempt ? "Yes" : "No"}</span></div>
        </div>

        {saveErr && (
          <div style={{ background: `${C.red}18`, border: `1px solid ${C.red}55`, borderRadius: 7, padding: "10px 14px", marginBottom: 14, fontSize: 12, color: C.red }}>
            <strong>Save failed:</strong> {saveErr}
          </div>
        )}

        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={async () => { setSaving(true); await onSave(form); setSaving(false); }}
            disabled={saving}
            style={{ flex: 1, background: C.yellow, color: "#111", border: "none", borderRadius: 8, padding: 13, fontWeight: 800, fontSize: 14, cursor: "pointer", opacity: saving ? 0.7 : 1 }}>
            {saving ? "Saving…" : "Save Entitlement"}
          </button>
          <button onClick={onClose}
            style={{ flex: 1, background: C.faint, color: C.text, border: "none", borderRadius: 8, padding: 13, cursor: "pointer", fontSize: 14 }}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main admin page ───────────────────────────────────────────────────────────

export default function ShilaconAdmin() {
  const [ready,    setReady]    = useState(false);
  const [denied,   setDenied]   = useState(false);
  const [loading,  setLoading]  = useState(true);
  const [data,     setData]     = useState<any>(null);
  const [token,    setToken]    = useState("");
  const [editing,  setEditing]  = useState<{ company: any; ent: any } | null>(null);
  const [saveErr,  setSaveErr]  = useState<string | null>(null);
  const [tab,      setTab]      = useState<"companies" | "ai_usage" | "requests">("companies");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { setDenied(true); setLoading(false); return; }
      setReady(true);
      setToken(session.access_token);
      await load(session.access_token);
    })();
  }, []);

  async function load(t: string) {
    setLoading(true);
    try {
      const res = await fetch("/api/admin", { headers: { Authorization: `Bearer ${t}` } });
      if (res.status === 401) { setDenied(true); return; }
      const json = await res.json();
      setData(json);
    } finally { setLoading(false); }
  }

  async function apiPost(body: any) {
    const res = await fetch("/api/admin", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });
    return res.json();
  }

  async function saveEntitlement(companyId: string, patch: any) {
    setSaveErr(null);
    const result = await apiPost({ action: "setEntitlement", companyId, ...patch });
    if (result?.error) {
      setSaveErr(result.error);
      return; // keep modal open so user can see the error
    }
    setEditing(null);
    await load(token);
  }

  async function quickAction(action: string, companyId: string) {
    await apiPost({ action, companyId });
    await load(token);
  }

  if (!ready && !denied && loading) return <Screen><p style={{ color: C.muted }}>Loading Shilacon…</p></Screen>;
  if (denied) return <Screen><p style={{ color: C.red, fontSize: 18, fontWeight: 700 }}>Access denied.</p></Screen>;

  const companies:    any[] = data?.companies    || [];
  const profiles:     any[] = data?.profiles     || [];
  const entitlements: any[] = data?.entitlements || [];
  const usageLogs:    any[] = data?.usageLogs    || [];
  const legacyUsage:  any[] = data?.usage        || [];
  const authUsers:    any[] = data?.authUsers    || [];
  const planRequests: any[] = (data?.planRequests  || []).filter((r: any) => r.status === "pending");
  const creditReqs:   any[] = (data?.creditRequests|| []).filter((r: any) => r.status === "pending");

  const now        = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();

  function getEnt(companyId: string) {
    return entitlements.find((e: any) => e.company_id === companyId) || null;
  }
  function companyUsers(id: string) { return profiles.filter((p: any) => p.company_id === id); }
  function userEmail(uid: string) { return authUsers.find((u: any) => u.id === uid)?.email || ""; }
  function monthUsage(id: string) {
    const fromNew = usageLogs.filter((u: any) => u.company_id === id && u.created_at >= monthStart);
    const fromOld = legacyUsage.filter((u: any) => u.company_id === id && u.created_at >= monthStart);
    return { count: fromNew.length + fromOld.length, cost: fromNew.reduce((s: number, u: any) => s + (u.estimated_cost || 0), 0) };
  }

  const aiEnabled   = companies.filter((c: any) => getEnt(c.id)?.ai_enabled).length;
  const totalUsers  = profiles.length;
  const monthCost   = usageLogs.filter((u: any) => u.created_at >= monthStart).reduce((s: number, u: any) => s + (u.estimated_cost || 0), 0);

  const TAB_STYLE = (active: boolean) => ({
    padding: "8px 18px", borderRadius: 6, cursor: "pointer", fontSize: 13, fontWeight: 600, border: "none",
    background: active ? C.yellow : "transparent",
    color: active ? "#111" : C.muted,
  });

  return (
    <main style={{ background: C.bg, minHeight: "100vh", color: C.text, fontFamily: "system-ui, sans-serif", padding: 24 }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 24 }}>
        <div style={{ width: 44, height: 44, borderRadius: 10, background: C.yellow, color: "#111", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 900, fontSize: 18, flexShrink: 0 }}>⬡</div>
        <div>
          <div style={{ fontWeight: 900, fontSize: 20, color: C.text }}>Shilacon Administration</div>
          <div style={{ color: C.muted, fontSize: 12 }}>Verixo — Internal Control Panel</div>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
          <button onClick={() => load(token)} disabled={loading}
            style={{ background: C.faint, color: C.text, border: "none", borderRadius: 7, padding: "7px 14px", cursor: "pointer", fontSize: 12 }}>
            {loading ? "…" : "↻ Refresh"}
          </button>
          <button onClick={() => supabase.auth.signOut().then(() => { window.location.href = "/"; })}
            style={{ background: "none", border: `1px solid ${C.faint}`, color: C.muted, borderRadius: 7, padding: "7px 14px", cursor: "pointer", fontSize: 12 }}>
            Sign out
          </button>
        </div>
      </div>

      {/* DB errors — always visible if any table fails */}
      {data?.debug && Object.entries(data.debug).some(([, v]) => v) && (
        <div style={{ background: `${C.red}18`, border: `1px solid ${C.red}44`, borderRadius: 8, padding: "10px 16px", marginBottom: 16, fontSize: 12, color: C.red }}>
          <strong>Database errors:</strong>{" "}
          {Object.entries(data.debug).filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`).join(" · ")}
        </div>
      )}

      {/* KPIs */}
      <div style={{ display: "flex", gap: 10, marginBottom: 20, flexWrap: "wrap" }}>
        <KPI label="Companies"    value={companies.length} sub="total registered" />
        <KPI label="Total Users"  value={totalUsers}       sub="across all companies" />
        <KPI label="AI Enabled"   value={aiEnabled}        sub="companies with AI access" color={C.green} />
        <KPI label="AI Cost (mo)" value={`$${(monthCost * 1.55).toFixed(2)}`} sub="est. AUD this month" color={C.yellow} />
        <KPI label="Pending"      value={planRequests.length + creditReqs.length} sub="action required" color={(planRequests.length + creditReqs.length) > 0 ? C.red : C.muted} />
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 4, marginBottom: 20, background: C.card, borderRadius: 8, padding: 4, width: "fit-content" }}>
        {(["companies", "ai_usage", "requests"] as const).map(t => (
          <button key={t} onClick={() => setTab(t)} style={TAB_STYLE(tab === t)}>
            {t === "companies" ? "Companies" : t === "ai_usage" ? "AI Usage" : "Requests"}
            {t === "requests" && (planRequests.length + creditReqs.length) > 0 && (
              <span style={{ background: C.red, color: "#fff", borderRadius: 10, padding: "0 6px", fontSize: 10, fontWeight: 700, marginLeft: 6 }}>
                {planRequests.length + creditReqs.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ── Companies tab ── */}
      {tab === "companies" && (
        <Card style={{ overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                {["Company", "Licence", "Sub Status", "AI", "Limit", "Users", "Usage (mo)", "Actions"].map(h => (
                  <th key={h} style={{ padding: "10px 14px", textAlign: "left", fontSize: 10, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: "0.06em", whiteSpace: "nowrap" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {companies.map((c: any) => {
                const ent   = getEnt(c.id);
                const users = companyUsers(c.id);
                const usage = monthUsage(c.id);
                const expanded = expandedId === c.id;
                return (
                  <React.Fragment key={c.id}>
                    <tr
                      style={{ borderBottom: `1px solid ${C.faint}`, cursor: "pointer", background: expanded ? "#141e2a" : "transparent" }}
                      onMouseEnter={e => { if (!expanded) e.currentTarget.style.background = "#0d1520"; }}
                      onMouseLeave={e => { if (!expanded) e.currentTarget.style.background = "transparent"; }}
                      onClick={() => setExpandedId(expanded ? null : c.id)}>
                      <td style={{ padding: "11px 14px" }}>
                        <div style={{ fontWeight: 700, fontSize: 13, color: C.text }}>{c.name}</div>
                        <div style={{ color: C.muted, fontSize: 11 }}>{c.country || ""}</div>
                      </td>
                      <td style={{ padding: "11px 14px" }}>
                        <Badge label={ent?.licence_type || "—"} color={LICENCE_COLOR[ent?.licence_type || ""] || C.muted} />
                        {ent?.billing_exempt && <Badge label="Exempt" color={C.yellow} />}
                      </td>
                      <td style={{ padding: "11px 14px" }}>
                        <Badge label={ent?.subscription_status || "—"} color={SUB_COLOR[ent?.subscription_status || ""] || C.muted} />
                      </td>
                      <td style={{ padding: "11px 14px" }}>
                        <span style={{ color: ent?.ai_enabled ? C.green : C.red, fontWeight: 700, fontSize: 13 }}>
                          {ent?.ai_enabled ? "✓ On" : "✗ Off"}
                        </span>
                      </td>
                      <td style={{ padding: "11px 14px", fontFamily: "monospace", color: C.text, fontSize: 12 }}>
                        {ent?.ai_monthly_limit === -1 ? "∞" : (ent?.ai_monthly_limit ?? "—")}
                      </td>
                      <td style={{ padding: "11px 14px", color: C.muted, fontSize: 13 }}>{users.length}</td>
                      <td style={{ padding: "11px 14px", fontFamily: "monospace", fontSize: 12, color: usage.cost > 5 ? C.yellow : C.muted }}>
                        {usage.count} calls · ${(usage.cost * 1.55).toFixed(2)}
                      </td>
                      <td style={{ padding: "11px 14px" }}>
                        <div style={{ display: "flex", gap: 6 }}>
                          <button onClick={e => { e.stopPropagation(); setEditing({ company: c, ent }); }}
                            style={{ background: C.yellow, color: "#111", border: "none", borderRadius: 5, padding: "5px 11px", fontWeight: 700, fontSize: 11, cursor: "pointer" }}>
                            Edit
                          </button>
                          <button onClick={async e => { e.stopPropagation(); await quickAction(ent?.ai_enabled ? "disableAi" : "enableAi", c.id); }}
                            style={{ background: ent?.ai_enabled ? `${C.red}22` : `${C.green}22`, color: ent?.ai_enabled ? C.red : C.green, border: `1px solid ${ent?.ai_enabled ? C.red : C.green}44`, borderRadius: 5, padding: "5px 11px", fontSize: 11, cursor: "pointer" }}>
                            {ent?.ai_enabled ? "Disable AI" : "Enable AI"}
                          </button>
                        </div>
                      </td>
                    </tr>
                    {expanded && (
                      <tr style={{ borderBottom: `1px solid ${C.faint}` }}>
                        <td colSpan={8} style={{ padding: "10px 14px 16px", background: "#0a1422" }}>
                          <div style={{ fontSize: 11, color: C.muted, fontWeight: 700, textTransform: "uppercase", marginBottom: 8 }}>Team Members</div>
                          {users.length === 0
                            ? <div style={{ color: C.muted, fontSize: 12 }}>No users</div>
                            : users.map((u: any) => (
                              <div key={u.id} style={{ fontSize: 12, color: C.text, marginBottom: 3, display: "flex", gap: 10 }}>
                                <span>{u.full_name || "Unnamed"}</span>
                                <span style={{ color: C.muted }}>{u.role}</span>
                                <span style={{ color: C.faint }}>{userEmail(u.id)}</span>
                              </div>
                            ))
                          }
                          <div style={{ marginTop: 12, display: "flex", gap: 8 }}>
                            <button onClick={() => quickAction("resetAiUsage", c.id)}
                              style={{ background: "none", border: `1px solid ${C.border}`, color: C.muted, borderRadius: 5, padding: "5px 12px", fontSize: 11, cursor: "pointer" }}>
                              Reset AI Usage Counter
                            </button>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
              {companies.length === 0 && (
                <tr><td colSpan={8} style={{ padding: 40, textAlign: "center", color: C.muted }}>No companies yet.</td></tr>
              )}
            </tbody>
          </table>
        </Card>
      )}

      {/* ── AI Usage tab ── */}
      {tab === "ai_usage" && (
        <Card style={{ overflow: "hidden" }}>
          <div style={{ padding: "14px 18px", borderBottom: `1px solid ${C.border}`, fontWeight: 700, fontSize: 13 }}>AI Usage Logs</div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                  {["Company", "Feature", "Model", "In Tokens", "Out Tokens", "Est. Cost AUD", "When"].map(h => (
                    <th key={h} style={{ padding: "8px 14px", textAlign: "left", fontSize: 10, fontWeight: 700, color: C.muted, textTransform: "uppercase", whiteSpace: "nowrap" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {usageLogs.slice(0, 100).map((u: any, i: number) => {
                  const co = companies.find((c: any) => c.id === u.company_id);
                  return (
                    <tr key={i} style={{ borderBottom: `1px solid ${C.faint}` }}>
                      <td style={{ padding: "9px 14px", fontSize: 12, color: C.text, fontWeight: 600 }}>{co?.name || "Unknown"}</td>
                      <td style={{ padding: "9px 14px", fontSize: 11, color: C.muted }}>{u.feature}</td>
                      <td style={{ padding: "9px 14px", fontSize: 11, color: C.faint, fontFamily: "monospace" }}>{(u.model || "—").replace("claude-", "")}</td>
                      <td style={{ padding: "9px 14px", fontFamily: "monospace", fontSize: 12 }}>{(u.input_tokens || 0).toLocaleString()}</td>
                      <td style={{ padding: "9px 14px", fontFamily: "monospace", fontSize: 12 }}>{(u.output_tokens || 0).toLocaleString()}</td>
                      <td style={{ padding: "9px 14px", fontFamily: "monospace", fontSize: 12, color: C.yellow }}>${((u.estimated_cost || 0) * 1.55).toFixed(4)}</td>
                      <td style={{ padding: "9px 14px", fontSize: 11, color: C.faint }}>{new Date(u.created_at).toLocaleString("en-AU")}</td>
                    </tr>
                  );
                })}
                {usageLogs.length === 0 && (
                  <tr><td colSpan={7} style={{ padding: 32, textAlign: "center", color: C.muted, fontSize: 13 }}>No AI usage logs yet.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* ── Requests tab ── */}
      {tab === "requests" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {planRequests.length === 0 && creditReqs.length === 0 && (
            <div style={{ color: C.muted, fontSize: 13, padding: 24, textAlign: "center" }}>No pending requests.</div>
          )}
          {[...planRequests, ...creditReqs].map((r: any) => {
            const co = companies.find((c: any) => c.id === r.company_id);
            return (
              <Card key={r.id} style={{ padding: 18 }}>
                <div style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700, fontSize: 14, color: C.text, marginBottom: 4 }}>{co?.name || r.company_id}</div>
                    <div style={{ fontSize: 12, color: C.muted }}>
                      {r.requested_plan ? `Plan change → ${r.requested_plan}` : `Credit top-up: ${r.credits_requested} credits`}
                      {" · "}Requested {new Date(r.requested_at).toLocaleDateString("en-AU")}
                    </div>
                    {r.notes && <div style={{ fontSize: 12, color: C.faint, marginTop: 4, fontStyle: "italic" }}>{r.notes}</div>}
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button
                      onClick={() => apiPost({ action: r.credits_requested ? "fulfillCreditRequest" : "approvePlanRequest", requestId: r.id, companyId: r.company_id, requestedPlan: r.requested_plan, creditsToAdd: r.credits_requested }).then(() => load(token))}
                      style={{ background: C.green, color: "#111", border: "none", borderRadius: 6, padding: "7px 14px", fontWeight: 700, fontSize: 12, cursor: "pointer" }}>
                      ✓ Approve
                    </button>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Entitlement editor modal */}
      {editing && (
        <EntitlementEditor
          company={editing.company}
          ent={editing.ent}
          onSave={patch => saveEntitlement(editing.company.id, patch)}
          onClose={() => { setEditing(null); setSaveErr(null); }}
          saveErr={saveErr}
        />
      )}
    </main>
  );
}

function Screen({ children }: { children: React.ReactNode }) {
  return (
    <main style={{ background: C.bg, minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "system-ui, sans-serif" }}>
      {children}
    </main>
  );
}
