"use client";

import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";

const ADMIN_EMAIL = "stuartdeannicholas@gmail.com";
const USD_TO_AUD = 1.55;

const PLAN_PRICE: Record<string, number> = {
  beta: 0, starter: 89, team: 149, pro: 229, enterprise: 999,
};
const PLAN_CREDITS: Record<string, number> = {
  beta: 100, starter: 200, team: 500, pro: 1500, enterprise: -1,
};
const PLANS = ["beta", "starter", "team", "pro", "enterprise"];
const PLAN_COLOR: Record<string, string> = {
  beta: "#64748b", starter: "#3b82f6", team: "#22c55e", pro: "#f59e0b", enterprise: "#a855f7",
};

const C = {
  bg: "#07090c", card: "#101820", border: "#1e293b", faint: "#334155",
  text: "#f1f5f9", muted: "#64748b",
  green: "#22c55e", yellow: "#f59e0b", red: "#ef4444", blue: "#3b82f6",
};

function Card({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, ...style }}>
      {children}
    </div>
  );
}

function KPI({ label, value, sub, color }: { label: string; value: string | number; sub?: string; color?: string }) {
  return (
    <Card style={{ flex: 1, minWidth: 150, padding: 20 }}>
      <div style={{ color: C.muted, fontSize: 11, textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 800, color: color || C.text, lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ color: C.muted, fontSize: 11, marginTop: 6 }}>{sub}</div>}
    </Card>
  );
}

export default function AdminPage() {
  const [ready, setReady] = useState(false);
  const [denied, setDenied] = useState(false);
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any>(null);
  const [token, setToken] = useState("");
  const [editing, setEditing] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [sortField, setSortField] = useState("created_at");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user?.email !== ADMIN_EMAIL) { setDenied(true); setLoading(false); return; }
      setReady(true);
      setToken(session.access_token);
      await load(session.access_token);
    })();
  }, []);

  async function load(t: string) {
    setLoading(true);
    try {
      const res = await fetch("/api/admin", { headers: { Authorization: `Bearer ${t}` } });
      setData(await res.json());
    } finally {
      setLoading(false);
    }
  }

  async function saveEdit() {
    setSaving(true);
    const limit = editing.plan === "enterprise" ? -1 : (PLAN_CREDITS[editing.plan] ?? editing.ai_monthly_limit);
    await fetch("/api/admin", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ action: "updateCompany", companyId: editing.id, plan: editing.plan, aiMonthlyLimit: limit, aiCreditsExtra: Number(editing.ai_credits_extra) || 0 }),
    });
    setSaving(false);
    setEditing(null);
    await load(token);
  }

  if (!ready && !denied && loading) {
    return <Screen><p style={{ color: C.muted }}>Loading…</p></Screen>;
  }
  if (denied) {
    return <Screen><p style={{ color: C.red, fontSize: 18, fontWeight: 700 }}>Access denied.</p></Screen>;
  }

  const companies: any[] = data?.companies || [];
  const usage: any[] = data?.usage || [];
  const profiles: any[] = data?.profiles || [];
  const authUsers: any[] = data?.authUsers || [];

  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();

  function companyUsage(id: string, thisMonth = false) {
    return usage.filter(u => u.company_id === id && (!thisMonth || u.created_at >= monthStart));
  }
  function companyUsers(id: string) {
    return profiles.filter(p => p.company_id === id);
  }
  function userEmail(userId: string) {
    return authUsers.find((u: any) => u.id === userId)?.email || "";
  }

  const totalMRR = companies.reduce((s, c) => s + (PLAN_PRICE[c.plan] || 0), 0);
  const monthUsage = usage.filter(u => u.created_at >= monthStart);
  const totalCostAUD = monthUsage.reduce((s, u) => s + (u.est_cost || 0), 0) * USD_TO_AUD;
  const totalCredits = monthUsage.reduce((s, u) => s + (u.credits || 0), 0);
  const netMargin = totalMRR - totalCostAUD;

  // Country breakdown
  const countryMap: Record<string, number> = {};
  companies.forEach(c => { if (c.country) countryMap[c.country] = (countryMap[c.country] || 0) + 1; });
  const countries = Object.entries(countryMap).sort((a, b) => b[1] - a[1]);

  function sortCompanies() {
    return [...companies].sort((a, b) => {
      let av: any, bv: any;
      if (sortField === "mrr") { av = PLAN_PRICE[a.plan] || 0; bv = PLAN_PRICE[b.plan] || 0; }
      else if (sortField === "users") { av = companyUsers(a.id).length; bv = companyUsers(b.id).length; }
      else if (sortField === "credits") { av = companyUsage(a.id, true).reduce((s, u) => s + u.credits, 0); bv = companyUsage(b.id, true).reduce((s, u) => s + u.credits, 0); }
      else if (sortField === "cost") { av = companyUsage(a.id, true).reduce((s, u) => s + u.est_cost, 0); bv = companyUsage(b.id, true).reduce((s, u) => s + u.est_cost, 0); }
      else { av = a[sortField]; bv = b[sortField]; }
      if (av < bv) return sortDir === "asc" ? -1 : 1;
      if (av > bv) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
  }

  function Th({ field, label }: { field: string; label: string }) {
    const active = sortField === field;
    return (
      <th onClick={() => { setSortField(field); setSortDir(d => active ? (d === "asc" ? "desc" : "asc") : "desc"); }}
        style={{ padding: "10px 14px", textAlign: "left", fontSize: 11, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap", color: active ? C.yellow : C.muted, borderBottom: `1px solid ${C.border}`, userSelect: "none" }}>
        {label}{active ? (sortDir === "asc" ? " ▲" : " ▼") : ""}
      </th>
    );
  }

  const sorted = sortCompanies();

  return (
    <main style={{ background: C.bg, minHeight: "100vh", color: C.text, fontFamily: "system-ui, Arial, sans-serif", padding: 24 }}>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 28 }}>
        <div style={{ width: 42, height: 42, borderRadius: 10, background: C.yellow, color: "#111", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 900, fontSize: 15, flexShrink: 0 }}>QF</div>
        <div>
          <div style={{ fontWeight: 800, fontSize: 22 }}>QuantaFlow Admin</div>
          <div style={{ color: C.muted, fontSize: 12 }}>
            {now.toLocaleDateString("en-AU", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
          </div>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
          <button onClick={() => load(token)} disabled={loading}
            style={{ background: C.faint, color: C.text, border: "none", borderRadius: 8, padding: "8px 16px", cursor: "pointer", fontSize: 13 }}>
            {loading ? "Loading…" : "↻ Refresh"}
          </button>
          <button onClick={() => supabase.auth.signOut().then(() => { window.location.href = "/"; })}
            style={{ background: "none", border: `1px solid ${C.faint}`, color: C.muted, borderRadius: 8, padding: "8px 16px", cursor: "pointer", fontSize: 13 }}>
            Sign out
          </button>
        </div>
      </div>

      {/* KPI strip */}
      <div style={{ display: "flex", gap: 12, marginBottom: 24, flexWrap: "wrap" }}>
        <KPI label="Companies" value={companies.length} sub="total registered" />
        <KPI label="Total Users" value={profiles.length} sub="across all companies" />
        <KPI label="Est. MRR" value={`$${totalMRR} AUD`} sub="monthly recurring revenue" color={C.green} />
        <KPI label="AI Cost (month)" value={`$${totalCostAUD.toFixed(0)} AUD`} sub="est. at 1 USD = 1.55 AUD" color={totalCostAUD > totalMRR * 0.35 ? C.red : C.yellow} />
        <KPI label="Net Margin" value={`$${netMargin.toFixed(0)} AUD`} sub="MRR minus AI cost" color={netMargin >= 0 ? C.green : C.red} />
        <KPI label="Credits Used" value={totalCredits} sub="AI pages processed this month" />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 16, marginBottom: 24, alignItems: "start" }}>

        {/* Companies table */}
        <Card style={{ overflow: "hidden" }}>
          <div style={{ padding: "16px 20px", borderBottom: `1px solid ${C.border}`, fontWeight: 700 }}>
            Companies <span style={{ color: C.muted, fontWeight: 400, fontSize: 13 }}>— click row to edit plan or add credits</span>
          </div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <Th field="name" label="Company" />
                  <Th field="plan" label="Plan" />
                  <Th field="users" label="Users" />
                  <Th field="credits" label="Credits (month)" />
                  <Th field="cost" label="AI Cost AUD" />
                  <Th field="mrr" label="MRR AUD" />
                  <Th field="created_at" label="Joined" />
                </tr>
              </thead>
              <tbody>
                {sorted.map(c => {
                  const mu = companyUsage(c.id, true);
                  const credits = mu.reduce((s: number, u: any) => s + (u.credits || 0), 0);
                  const costAUD = mu.reduce((s: number, u: any) => s + (u.est_cost || 0), 0) * USD_TO_AUD;
                  const mrr = PLAN_PRICE[c.plan] || 0;
                  const limit = c.ai_monthly_limit < 0 ? -1 : (c.ai_monthly_limit + (c.ai_credits_extra || 0));
                  const pct = limit < 0 ? 0 : Math.min(100, credits / limit * 100);
                  const users = companyUsers(c.id);
                  const expanded = expandedId === c.id;
                  const unprofitable = mrr > 0 && costAUD > mrr * 0.5;

                  return (
                    <>
                      <tr key={c.id}
                        onClick={() => setExpandedId(expanded ? null : c.id)}
                        style={{ cursor: "pointer", borderBottom: expanded ? "none" : `1px solid ${C.faint}`, background: expanded ? C.faint : "transparent" }}
                        onMouseEnter={e => { if (!expanded) e.currentTarget.style.background = "#1a2535"; }}
                        onMouseLeave={e => { if (!expanded) e.currentTarget.style.background = "transparent"; }}>
                        <td style={{ padding: "12px 14px" }}>
                          <div style={{ fontWeight: 600, fontSize: 14 }}>{c.name}</div>
                          {c.country && <div style={{ color: C.muted, fontSize: 11 }}>📍 {c.country}</div>}
                        </td>
                        <td style={{ padding: "12px 14px" }}>
                          <span style={{ background: `${PLAN_COLOR[c.plan] || C.muted}22`, color: PLAN_COLOR[c.plan] || C.muted, borderRadius: 6, padding: "3px 9px", fontSize: 12, fontWeight: 700 }}>
                            {c.plan}
                          </span>
                        </td>
                        <td style={{ padding: "12px 14px", color: C.text }}>{users.length}</td>
                        <td style={{ padding: "12px 14px" }}>
                          {limit < 0 ? (
                            <span style={{ color: C.green, fontSize: 12 }}>∞ {credits} used</span>
                          ) : (
                            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                              <div style={{ width: 50, height: 4, borderRadius: 2, background: C.border, overflow: "hidden" }}>
                                <div style={{ width: `${pct}%`, height: "100%", background: pct >= 100 ? C.red : pct > 80 ? C.yellow : C.green, borderRadius: 2 }} />
                              </div>
                              <span style={{ fontSize: 12, color: pct >= 100 ? C.red : C.muted }}>{credits}/{limit}</span>
                            </div>
                          )}
                        </td>
                        <td style={{ padding: "12px 14px", fontFamily: "monospace", color: unprofitable ? C.red : C.text }}>
                          ${costAUD.toFixed(2)}{unprofitable && " ⚠"}
                        </td>
                        <td style={{ padding: "12px 14px", fontFamily: "monospace", fontWeight: 700, color: C.green }}>${mrr}</td>
                        <td style={{ padding: "12px 14px", color: C.muted, fontSize: 12 }}>
                          {new Date(c.created_at).toLocaleDateString("en-AU")}
                        </td>
                      </tr>

                      {/* Expanded row */}
                      {expanded && (
                        <tr key={`${c.id}-exp`} style={{ borderBottom: `1px solid ${C.faint}` }}>
                          <td colSpan={7} style={{ padding: "0 14px 14px 14px", background: C.faint }}>
                            <div style={{ display: "flex", gap: 16, flexWrap: "wrap", paddingTop: 10 }}>

                              {/* Users */}
                              <div style={{ flex: 1, minWidth: 200 }}>
                                <div style={{ fontSize: 11, color: C.muted, fontWeight: 700, marginBottom: 8, textTransform: "uppercase" }}>Team Members</div>
                                {users.length === 0 ? <div style={{ color: C.muted, fontSize: 13 }}>No users yet</div> : users.map((u: any) => (
                                  <div key={u.id} style={{ fontSize: 13, display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                                    <span style={{ color: C.text }}>{u.full_name || "Unnamed"}</span>
                                    <span style={{ color: C.muted, fontSize: 11 }}>{u.role}</span>
                                    <span style={{ color: C.muted, fontSize: 11 }}>— {userEmail(u.id)}</span>
                                  </div>
                                ))}
                              </div>

                              {/* All-time usage */}
                              <div style={{ flex: 1, minWidth: 200 }}>
                                <div style={{ fontSize: 11, color: C.muted, fontWeight: 700, marginBottom: 8, textTransform: "uppercase" }}>All-time Usage</div>
                                {(() => {
                                  const all = companyUsage(c.id);
                                  const allCredits = all.reduce((s: number, u: any) => s + u.credits, 0);
                                  const allCost = all.reduce((s: number, u: any) => s + u.est_cost, 0) * USD_TO_AUD;
                                  const allPages = all.reduce((s: number, u: any) => s + (u.pages || 0), 0);
                                  return (
                                    <div style={{ fontSize: 13, color: C.text, display: "flex", flexDirection: "column", gap: 4 }}>
                                      <div><span style={{ color: C.muted }}>Total AI calls:</span> {all.length}</div>
                                      <div><span style={{ color: C.muted }}>Pages processed:</span> {allPages}</div>
                                      <div><span style={{ color: C.muted }}>Credits consumed:</span> {allCredits}</div>
                                      <div><span style={{ color: C.muted }}>Est. AI cost:</span> ${allCost.toFixed(2)} AUD</div>
                                    </div>
                                  );
                                })()}
                              </div>

                              {/* Actions */}
                              <div style={{ display: "flex", alignItems: "flex-start", paddingTop: 22 }}>
                                <button onClick={() => setEditing({ ...c })}
                                  style={{ background: C.yellow, color: "#111", border: "none", borderRadius: 8, padding: "9px 20px", fontWeight: 700, cursor: "pointer", fontSize: 14 }}>
                                  Edit Plan / Credits
                                </button>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                  );
                })}
                {companies.length === 0 && (
                  <tr><td colSpan={7} style={{ padding: 48, textAlign: "center", color: C.muted }}>No companies yet.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>

        {/* Right column: location + recent activity */}
        <div style={{ display: "flex", flexDirection: "column", gap: 12, minWidth: 220, maxWidth: 260 }}>

          {/* Geographic breakdown */}
          <Card style={{ padding: 20 }}>
            <div style={{ fontWeight: 700, marginBottom: 14, fontSize: 13 }}>📍 Location</div>
            {countries.length === 0 ? (
              <div style={{ color: C.muted, fontSize: 13 }}>No country data yet</div>
            ) : countries.map(([country, count]) => (
              <div key={country} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <span style={{ fontSize: 13, color: C.text }}>{country}</span>
                <span style={{ fontSize: 12, color: C.muted, fontFamily: "monospace" }}>{count} co.</span>
              </div>
            ))}
          </Card>

          {/* Recent AI activity */}
          <Card style={{ padding: 20 }}>
            <div style={{ fontWeight: 700, marginBottom: 14, fontSize: 13 }}>⚡ Recent AI Activity</div>
            {usage.slice(0, 12).map((u: any, i: number) => {
              const co = companies.find(c => c.id === u.company_id);
              return (
                <div key={i} style={{ marginBottom: 10, borderBottom: `1px solid ${C.faint}`, paddingBottom: 8 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: C.text }}>{co?.name || "Unknown"}</div>
                  <div style={{ fontSize: 11, color: C.muted }}>
                    {u.kind === "ai_scan" ? "Scan" : "Extract"} · {u.pages || 0} pages · {u.credits} credits
                  </div>
                  <div style={{ fontSize: 11, color: C.faint }}>{new Date(u.created_at).toLocaleString("en-AU")}</div>
                </div>
              );
            })}
            {usage.length === 0 && <div style={{ color: C.muted, fontSize: 13 }}>No AI usage yet</div>}
          </Card>
        </div>
      </div>

      {/* Edit company modal */}
      {editing && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999 }}>
          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: 28, width: 440, maxWidth: "90vw" }}>
            <div style={{ fontWeight: 800, fontSize: 18, marginBottom: 4 }}>{editing.name}</div>
            <div style={{ color: C.muted, fontSize: 13, marginBottom: 24 }}>{editing.country}</div>

            <div style={{ marginBottom: 16 }}>
              <label style={{ color: C.muted, fontSize: 12, display: "block", marginBottom: 6 }}>Plan</label>
              <select value={editing.plan}
                onChange={e => setEditing((p: any) => ({ ...p, plan: e.target.value }))}
                style={{ width: "100%", background: "#0f172a", color: C.text, border: `1px solid ${C.border}`, borderRadius: 8, padding: "11px 12px", fontSize: 14 }}>
                {PLANS.map(p => (
                  <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)} — ${PLAN_PRICE[p]}/mo · {PLAN_CREDITS[p] === -1 ? "Unlimited credits" : `${PLAN_CREDITS[p]} credits/mo`}</option>
                ))}
              </select>
            </div>

            <div style={{ marginBottom: 24 }}>
              <label style={{ color: C.muted, fontSize: 12, display: "block", marginBottom: 6 }}>
                Extra purchased credits <span style={{ color: C.faint }}>(one-off top-up, adds to monthly limit)</span>
              </label>
              <input type="number" min={0}
                value={editing.ai_credits_extra || 0}
                onChange={e => setEditing((p: any) => ({ ...p, ai_credits_extra: parseInt(e.target.value) || 0 }))}
                style={{ width: "100%", background: "#0f172a", color: C.text, border: `1px solid ${C.border}`, borderRadius: 8, padding: "11px 12px", fontSize: 14, boxSizing: "border-box" }} />
            </div>

            <div style={{ background: C.faint, borderRadius: 8, padding: 12, marginBottom: 20, fontSize: 13 }}>
              <div style={{ color: C.muted, marginBottom: 4 }}>After saving:</div>
              <div style={{ color: C.text }}>
                Monthly limit → {editing.plan === "enterprise" ? "Unlimited" : `${(PLAN_CREDITS[editing.plan] ?? 0) + (editing.ai_credits_extra || 0)} credits`}
              </div>
              <div style={{ color: C.green }}>Revenue → ${PLAN_PRICE[editing.plan] || 0} AUD/mo</div>
            </div>

            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={saveEdit} disabled={saving}
                style={{ flex: 1, background: C.yellow, color: "#111", border: "none", borderRadius: 8, padding: 13, fontWeight: 800, cursor: "pointer", fontSize: 15 }}>
                {saving ? "Saving…" : "Save Changes"}
              </button>
              <button onClick={() => setEditing(null)}
                style={{ flex: 1, background: C.faint, color: C.text, border: "none", borderRadius: 8, padding: 13, cursor: "pointer", fontSize: 15 }}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

    </main>
  );
}

function Screen({ children }: { children: React.ReactNode }) {
  return (
    <main style={{ background: C.bg, minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "system-ui, Arial, sans-serif" }}>
      {children}
    </main>
  );
}
