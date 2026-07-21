"use client";
// ─────────────────────────────────────────────────────────────────────────────
// CabinetDatabase — the heart of Verixo.
// Every cabinet exists as an individual, editable object.
// All other modules (Estimate, Box Matrix, Procurement, Manufacturing) derive
// their data from here. Nothing is ever locked.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "../../lib/supabase";
import {
  listCabinets,
  listDraftCabinets,
  createCabinet,
  createCabinets,
  updateCabinet,
  deleteCabinet,
  approveDraftCabinet,
  approveAllDraftCabinets,
  deleteAllDraftCabinets,
} from "../../lib/db/cabinets";

// ── Constants ────────────────────────────────────────────────────────────────

const CABINET_TYPES = [
  "Base Cabinet", "Overhead Cabinet", "Pantry Cabinet", "Tall Cabinet",
  "Island / Peninsula", "Vanity", "Linen Tower", "Wardrobe", "Laundry Cabinet",
  "TV Unit", "Study Desk", "Credenza", "Wall Unit", "Custom",
];

const STATUSES = [
  { key: "pending",    label: "Pending",    color: "#6b7280" },
  { key: "cutting",    label: "Cutting",    color: "#d97706" },
  { key: "assembled",  label: "Assembled",  color: "#7c3aed" },
  { key: "qc",         label: "QC Check",   color: "#2563eb" },
  { key: "dispatched", label: "Dispatched", color: "#0891b2" },
  { key: "installed",  label: "Installed",  color: "#16a34a" },
];

const AI_SOURCES = { manual: "Manual", ai_assist: "AI Assisted", ai_takeoff: "AI Takeoff" };

const BLANK_CABINET = {
  building: "", level: "", unit_type: "", joinery_type: "", room: "",
  cabinet_number: "", cabinet_type: "Base Cabinet", description: "",
  width: 600, height: 720, depth: 580,
  material: "", door_style: "", door_qty: 2, drawer_qty: 0,
  hardware: [], panels: [],
  has_benchtop: false, benchtop_material: "",
  has_kickboard: true,
  labour_hours: 0, unit_cost: 0, sell_price: 0,
  status: "pending", ai_draft: false, ai_source: "manual",
  ai_confidence: null, ai_explanation: "",
};

// ── Confidence badge ─────────────────────────────────────────────────────────

function ConfidenceBadge({ score, T }) {
  if (score === null || score === undefined) return null;
  const n = Number(score);
  const color = n >= 90 ? "#16a34a" : n >= 70 ? "#d97706" : "#dc2626";
  const bg = n >= 90 ? "rgba(22,163,74,0.12)" : n >= 70 ? "rgba(217,119,6,0.12)" : "rgba(220,38,38,0.12)";
  const label = n >= 90 ? "High" : n >= 70 ? "Medium" : "Low";
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 4,
      background: bg, color, border: `1px solid ${color}44`,
      borderRadius: 4, padding: "1px 7px", fontSize: 11, fontWeight: 700,
    }}>
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: color }} />
      {n}% {label}
    </span>
  );
}

// ── AI Draft Review Banner ────────────────────────────────────────────────────

function DraftReviewBanner({ draftCabinets, onApproveAll, onDiscardAll, onFilter, filteringDraft, T }) {
  const [busy, setBusy] = useState(false);
  if (!draftCabinets.length) return null;
  const low = draftCabinets.filter(c => (c.ai_confidence ?? 100) < 70).length;
  const med = draftCabinets.filter(c => (c.ai_confidence ?? 100) >= 70 && (c.ai_confidence ?? 100) < 90).length;
  const hi  = draftCabinets.filter(c => (c.ai_confidence ?? 100) >= 90).length;

  return (
    <div style={{
      background: "rgba(59,130,246,0.08)",
      border: "1px solid rgba(59,130,246,0.3)",
      borderRadius: 8, padding: "14px 18px", marginBottom: 18,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 240 }}>
          <div style={{ fontWeight: 800, fontSize: 13, color: "#3b82f6", marginBottom: 4 }}>
            ✦ AI Draft Review — {draftCabinets.length} cabinet{draftCabinets.length !== 1 ? "s" : ""} awaiting approval
          </div>
          <div style={{ fontSize: 12, color: T.muted, display: "flex", gap: 12, flexWrap: "wrap" }}>
            {hi > 0  && <span style={{ color: "#16a34a" }}>● {hi} high confidence</span>}
            {med > 0 && <span style={{ color: "#d97706" }}>● {med} medium confidence</span>}
            {low > 0 && <span style={{ color: "#dc2626", fontWeight: 700 }}>● {low} needs review</span>}
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button
            onClick={onFilter}
            style={{
              background: filteringDraft ? "rgba(59,130,246,0.2)" : T.card2,
              color: filteringDraft ? "#3b82f6" : T.muted,
              border: `1px solid ${filteringDraft ? "rgba(59,130,246,0.5)" : T.border}`,
              borderRadius: 5, padding: "7px 14px", fontSize: 12, cursor: "pointer", fontWeight: 600,
            }}>
            {filteringDraft ? "✓ Showing Draft" : "Review Draft"}
          </button>
          <button
            onClick={async () => { setBusy(true); await onApproveAll(); setBusy(false); }}
            disabled={busy}
            style={{ background: "#16a34a", color: "#fff", border: "none", borderRadius: 5, padding: "7px 14px", fontSize: 12, cursor: "pointer", fontWeight: 700, opacity: busy ? 0.7 : 1 }}>
            ✓ Approve All
          </button>
          <button
            onClick={onDiscardAll}
            style={{ background: "none", color: "#dc2626", border: "1px solid rgba(220,38,38,0.3)", borderRadius: 5, padding: "7px 14px", fontSize: 12, cursor: "pointer" }}>
            ✗ Discard All
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Cabinet Row (compact list view) ──────────────────────────────────────────

function CabinetRow({ cab, onEdit, onDelete, onStatusChange, T }) {
  const statusDef = STATUSES.find(s => s.key === cab.status) || STATUSES[0];
  const [statusOpen, setStatusOpen] = useState(false);

  return (
    <div style={{
      background: cab.ai_draft ? "rgba(59,130,246,0.05)" : T.card,
      border: `1px solid ${cab.ai_draft ? "rgba(59,130,246,0.25)" : T.border}`,
      borderRadius: 7, padding: "10px 14px", marginBottom: 6,
      display: "grid", minWidth: 680,
      gridTemplateColumns: "80px 1fr 80px 80px 80px 100px 130px 80px",
      gap: "0 10px", alignItems: "center",
      fontSize: 12,
    }}>
      {/* Cabinet number */}
      <div style={{ fontFamily: "monospace", fontWeight: 700, color: T.accent, fontSize: 12 }}>
        {cab.cabinet_number || "—"}
      </div>

      {/* Description */}
      <div>
        <div style={{ fontWeight: 600, color: T.text, fontSize: 12 }}>
          {cab.description || cab.cabinet_type}
        </div>
        <div style={{ color: T.faint, fontSize: 11, marginTop: 1 }}>
          {[cab.room, cab.level, cab.building].filter(Boolean).join(" · ") || "No location"}
        </div>
      </div>

      {/* Dimensions */}
      <div style={{ color: T.muted, fontFamily: "monospace", fontSize: 11 }}>
        {cab.width}×{cab.height}×{cab.depth}
      </div>

      {/* Doors / Drawers */}
      <div style={{ color: T.muted }}>
        {cab.door_qty}D {cab.drawer_qty > 0 ? `${cab.drawer_qty}Dr` : ""}
      </div>

      {/* Sell price */}
      <div style={{ fontFamily: "monospace", fontWeight: 700, color: T.text }}>
        {cab.sell_price ? `$${Number(cab.sell_price).toFixed(0)}` : "—"}
      </div>

      {/* AI confidence */}
      <div>
        {cab.ai_draft
          ? <ConfidenceBadge score={cab.ai_confidence} T={T} />
          : <span style={{ fontSize: 11, color: T.faint }}>{AI_SOURCES[cab.ai_source] || "Manual"}</span>
        }
      </div>

      {/* Status picker */}
      <div style={{ position: "relative" }}>
        <button
          onClick={() => setStatusOpen(o => !o)}
          style={{
            background: `${statusDef.color}18`, color: statusDef.color,
            border: `1px solid ${statusDef.color}44`,
            borderRadius: 4, padding: "3px 8px", fontSize: 11, fontWeight: 700, cursor: "pointer",
            width: "100%", textAlign: "left",
          }}>
          ● {statusDef.label}
        </button>
        {statusOpen && (
          <div style={{
            position: "absolute", top: "calc(100% + 4px)", left: 0, zIndex: 100,
            background: T.panel, border: `1px solid ${T.border}`, borderRadius: 6,
            overflow: "hidden", minWidth: 130, boxShadow: "0 8px 24px rgba(0,0,0,0.3)",
          }}>
            {STATUSES.map(s => (
              <div
                key={s.key}
                onClick={() => { onStatusChange(cab.id, s.key); setStatusOpen(false); }}
                style={{
                  padding: "8px 12px", cursor: "pointer", fontSize: 12,
                  color: s.color, fontWeight: 600,
                  background: s.key === cab.status ? `${s.color}18` : "transparent",
                }}
                onMouseEnter={e => e.currentTarget.style.background = `${s.color}15`}
                onMouseLeave={e => e.currentTarget.style.background = s.key === cab.status ? `${s.color}18` : "transparent"}>
                ● {s.label}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Actions */}
      <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
        <button onClick={() => onEdit(cab)}
          style={{ background: T.card2, color: T.muted, border: `1px solid ${T.border}`, borderRadius: 4, padding: "4px 10px", fontSize: 11, cursor: "pointer" }}>
          Edit
        </button>
        <button onClick={() => onDelete(cab.id)}
          style={{ background: "none", color: T.faint, border: "none", padding: "4px 6px", fontSize: 12, cursor: "pointer" }}>
          ✕
        </button>
      </div>
    </div>
  );
}

// ── Cabinet Editor (inline full form) ────────────────────────────────────────

function CabinetEditor({ cab, onSave, onCancel, onApprove, T, isMobile }) {
  const [form, setForm] = useState({ ...BLANK_CABINET, ...cab });
  const [busy, setBusy] = useState(false);

  function set(k, v) { setForm(f => ({ ...f, [k]: v })); }

  const inputStyle = {
    width: "100%", boxSizing: "border-box", background: T.bg, color: T.text,
    border: `1px solid ${T.border}`, borderRadius: 5,
    padding: "7px 10px", fontSize: 12, fontFamily: "monospace",
  };
  const labelStyle = { fontSize: 10, color: T.faint, marginBottom: 4, display: "block", fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase" };
  const F = ({ label, children }) => <div style={{ marginBottom: 12 }}><label style={labelStyle}>{label}</label>{children}</div>;
  const Inp = ({ k, type = "text", step }) => (
    <input type={type} step={step} value={form[k] ?? ""} onChange={e => set(k, type === "number" ? (parseFloat(e.target.value) || 0) : e.target.value)} style={inputStyle} />
  );
  const Sel = ({ k, options }) => (
    <select value={form[k] || ""} onChange={e => set(k, e.target.value)} style={{ ...inputStyle, cursor: "pointer" }}>
      <option value="">—</option>
      {options.map(o => typeof o === "string" ? <option key={o} value={o}>{o}</option> : <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );

  async function handleSave() {
    setBusy(true);
    await onSave(form);
    setBusy(false);
  }

  return (
    <div style={{ background: T.card, border: `1px solid ${T.accentBrd}`, borderRadius: 8, padding: 18, marginBottom: 8 }}>
      {/* AI explanation banner */}
      {form.ai_draft && form.ai_explanation && (
        <div style={{ background: "rgba(59,130,246,0.1)", border: "1px solid rgba(59,130,246,0.25)", borderRadius: 6, padding: "10px 14px", marginBottom: 14, fontSize: 12, color: "#93c5fd" }}>
          <div style={{ fontWeight: 700, marginBottom: 4 }}>Why did AI create this?</div>
          <div style={{ lineHeight: 1.6 }}>{form.ai_explanation}</div>
          {form.ai_confidence !== null && <ConfidenceBadge score={form.ai_confidence} T={T} />}
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "1fr 1fr 1fr 1fr", gap: "0 14px" }}>
        {/* Section: Identity */}
        <div style={{ gridColumn: "1/-1", fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: T.accent, marginBottom: 8, paddingBottom: 6, borderBottom: `1px solid ${T.border}` }}>Identity</div>
        <F label="Cabinet Number"><Inp k="cabinet_number" /></F>
        <F label="Cabinet Type"><Sel k="cabinet_type" options={CABINET_TYPES} /></F>
        <F label="Description" ><div style={{ gridColumn: "span 2" }}><input style={{ ...inputStyle, width: "100%" }} value={form.description} onChange={e => set("description", e.target.value)} /></div></F>

        {/* Section: Location */}
        <div style={{ gridColumn: "1/-1", fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: T.accent, margin: "8px 0", paddingBottom: 6, borderBottom: `1px solid ${T.border}` }}>Location</div>
        <F label="Room"><Inp k="room" /></F>
        <F label="Unit Type"><Inp k="unit_type" /></F>
        <F label="Joinery Type"><Inp k="joinery_type" /></F>
        <F label="Level"><Inp k="level" /></F>
        <F label="Building"><Inp k="building" /></F>

        {/* Section: Dimensions */}
        <div style={{ gridColumn: "1/-1", fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: T.accent, margin: "8px 0", paddingBottom: 6, borderBottom: `1px solid ${T.border}` }}>Dimensions (mm)</div>
        <F label="Width"><Inp k="width" type="number" /></F>
        <F label="Height"><Inp k="height" type="number" /></F>
        <F label="Depth"><Inp k="depth" type="number" /></F>

        {/* Section: Finishes */}
        <div style={{ gridColumn: "1/-1", fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: T.accent, margin: "8px 0", paddingBottom: 6, borderBottom: `1px solid ${T.border}` }}>Finishes & Hardware</div>
        <F label="Material / Carcass"><Inp k="material" /></F>
        <F label="Door Style"><Inp k="door_style" /></F>
        <F label="Door Qty"><Inp k="door_qty" type="number" /></F>
        <F label="Drawer Qty"><Inp k="drawer_qty" type="number" /></F>

        <div style={{ display: "flex", gap: 16, alignItems: "center", gridColumn: "1/-1", marginBottom: 12 }}>
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: T.muted, cursor: "pointer" }}>
            <input type="checkbox" checked={form.has_benchtop} onChange={e => set("has_benchtop", e.target.checked)} />
            Benchtop
          </label>
          {form.has_benchtop && <input type="text" placeholder="Material" value={form.benchtop_material} onChange={e => set("benchtop_material", e.target.value)} style={{ ...inputStyle, width: 180 }} />}
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: T.muted, cursor: "pointer" }}>
            <input type="checkbox" checked={form.has_kickboard} onChange={e => set("has_kickboard", e.target.checked)} />
            Kickboard
          </label>
        </div>

        {/* Section: Costing */}
        <div style={{ gridColumn: "1/-1", fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: T.accent, margin: "8px 0", paddingBottom: 6, borderBottom: `1px solid ${T.border}` }}>Costing</div>
        <F label="Labour Hours"><Inp k="labour_hours" type="number" step="0.25" /></F>
        <F label="Unit Cost ($)"><Inp k="unit_cost" type="number" step="0.01" /></F>
        <F label="Sell Price ($)"><Inp k="sell_price" type="number" step="0.01" /></F>

        {/* Section: Status */}
        <div style={{ gridColumn: "1/-1", fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: T.accent, margin: "8px 0", paddingBottom: 6, borderBottom: `1px solid ${T.border}` }}>Status</div>
        <F label="Production Status">
          <Sel k="status" options={STATUSES.map(s => ({ value: s.key, label: s.label }))} />
        </F>
      </div>

      {/* Actions */}
      <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
        <button onClick={handleSave} disabled={busy}
          style={{ background: T.accent, color: "#000", border: "none", borderRadius: 5, padding: "8px 20px", fontWeight: 800, fontSize: 13, cursor: "pointer", opacity: busy ? 0.7 : 1 }}>
          {busy ? "Saving…" : "Save Cabinet"}
        </button>
        {form.ai_draft && onApprove && (
          <button onClick={() => onApprove(form.id)}
            style={{ background: "#16a34a", color: "#fff", border: "none", borderRadius: 5, padding: "8px 20px", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
            ✓ Approve
          </button>
        )}
        <button onClick={onCancel}
          style={{ background: "none", border: `1px solid ${T.border}`, color: T.muted, borderRadius: 5, padding: "8px 16px", fontSize: 13, cursor: "pointer" }}>
          Cancel
        </button>
      </div>
    </div>
  );
}

// ── Group header ──────────────────────────────────────────────────────────────

function GroupHeader({ label, count, totalSell, expanded, onToggle, T }) {
  const fmt = v => `$${Number(v).toLocaleString("en-AU", { minimumFractionDigits: 0 })}`;
  return (
    <div
      onClick={onToggle}
      style={{
        display: "flex", alignItems: "center", gap: 10,
        padding: "9px 14px", borderRadius: 6, marginBottom: 4, cursor: "pointer",
        background: T.card2, border: `1px solid ${T.border}`,
      }}
      onMouseEnter={e => e.currentTarget.style.borderColor = T.accentBrd}
      onMouseLeave={e => e.currentTarget.style.borderColor = T.border}>
      <span style={{ fontSize: 11, color: T.faint }}>{expanded ? "▾" : "▸"}</span>
      <span style={{ fontWeight: 700, fontSize: 13, color: T.text, flex: 1 }}>{label}</span>
      <span style={{ fontSize: 12, color: T.muted }}>{count} cabinet{count !== 1 ? "s" : ""}</span>
      <span style={{ fontFamily: "monospace", fontWeight: 700, color: T.accent, fontSize: 13 }}>{fmt(totalSell)}</span>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function CabinetDatabase({ proj, company, T, pop }) {
  const projectId = proj?.id;
  const [windowW, setWindowW] = useState(typeof window !== "undefined" ? window.innerWidth : 1200);
  useEffect(() => {
    function onResize() { setWindowW(window.innerWidth); }
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  const isMobile = windowW < 768;

  const [cabinets,      setCabinets]      = useState([]);
  const [draftCabinets, setDraftCabinets] = useState([]);
  const [loading,       setLoading]       = useState(true);
  const [editingId,     setEditingId]     = useState(null); // "new" or cabinet id
  const [filteringDraft,setFilteringDraft]= useState(false);
  const [groupBy,       setGroupBy]       = useState(proj?.breakdown_preference || "room");
  const [search,        setSearch]        = useState("");
  const [collapsedGroups, setCollapsedGroups] = useState({});
  const [sortDir, setSortDir] = useState("asc");
  const [statusFilter, setStatusFilter] = useState(""); // "" = all
  const [aiOpen,    setAiOpen]    = useState(false);
  const [aiFiles,   setAiFiles]   = useState([]);
  const [aiLog,     setAiLog]     = useState([]);
  const [aiRunning, setAiRunning] = useState(false);
  const aiFileRef = useRef(null);

  const load = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    const [live, draft] = await Promise.all([
      listCabinets(projectId),
      listDraftCabinets(projectId),
    ]);
    setCabinets(live.data || []);
    setDraftCabinets(draft.data || []);
    setLoading(false);
  }, [projectId]);

  useEffect(() => { load(); }, [load]);

  // ── Filter / group ──────────────────────────────────────────────────────────

  const displayCabinets = filteringDraft ? draftCabinets : cabinets;
  const filtered = displayCabinets.filter(c => {
    if (statusFilter && c.status !== statusFilter) return false;
    if (search && !`${c.cabinet_number} ${c.description} ${c.cabinet_type} ${c.room} ${c.unit_type} ${c.joinery_type}`
        .toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  function groupKey(c) {
    if (groupBy === "room")         return c.room        || "Unassigned";
    if (groupBy === "unit_type")    return c.unit_type   || "Unassigned";
    if (groupBy === "joinery_type") return c.joinery_type|| "Unassigned";
    if (groupBy === "status")       return c.status      || "pending";
    return "All Cabinets";
  }

  const groups = {};
  for (const c of filtered) {
    const k = groupKey(c);
    if (!groups[k]) groups[k] = [];
    groups[k].push(c);
  }

  const totalSell   = cabinets.reduce((s, c) => s + Number(c.sell_price  || 0), 0);
  const totalCost   = cabinets.reduce((s, c) => s + Number(c.unit_cost   || 0), 0);
  const totalLabour = cabinets.reduce((s, c) => s + Number(c.labour_hours|| 0), 0);

  // ── Handlers ────────────────────────────────────────────────────────────────

  async function handleSaveNew(form) {
    const { error } = await createCabinet(projectId, form);
    if (error) { pop?.(error, "error"); return; }
    setEditingId(null);
    pop?.("Cabinet added.");
    load();
  }

  async function handleSaveExisting(form) {
    const { error } = await updateCabinet(form.id, form);
    if (error) { pop?.(error, "error"); return; }
    setEditingId(null);
    pop?.("Cabinet saved.");
    load();
  }

  async function handleDelete(id) {
    if (!window.confirm("Delete this cabinet?")) return;
    await deleteCabinet(id);
    pop?.("Cabinet deleted.");
    load();
  }

  async function handleStatusChange(id, status) {
    await updateCabinet(id, { status });
    load();
  }

  async function handleApprove(id) {
    await approveDraftCabinet(id);
    pop?.("Cabinet approved.");
    load();
  }

  async function handleApproveAll() {
    await approveAllDraftCabinets(projectId);
    setFilteringDraft(false);
    pop?.("All AI suggestions approved.");
    load();
  }

  async function handleDiscardAll() {
    if (!window.confirm(`Discard all ${draftCabinets.length} AI-generated draft cabinets?`)) return;
    await deleteAllDraftCabinets(projectId);
    setFilteringDraft(false);
    pop?.("Draft cabinets discarded.");
    load();
  }

  function toggleGroup(k) {
    setCollapsedGroups(g => ({ ...g, [k]: !g[k] }));
  }

  // ── AI Extraction from Plans ────────────────────────────────────────────────

  function addLog(msg, type = "info") {
    setAiLog(l => [...l, { msg, type, t: Date.now() }]);
  }

  async function loadPdfJs() {
    if (window.pdfjsLib) return window.pdfjsLib;
    await new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
      s.onload = resolve; s.onerror = reject;
      document.head.appendChild(s);
    });
    window.pdfjsLib.GlobalWorkerOptions.workerSrc =
      "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
    return window.pdfjsLib;
  }

  async function fileToBase64Images(file) {
    if (file.type === "application/pdf") {
      addLog(`Rasterising PDF: ${file.name}…`);
      const lib = await loadPdfJs();
      const buf = await file.arrayBuffer();
      const pdf = await lib.getDocument({ data: buf }).promise;
      const imgs = [];
      for (let i = 1; i <= pdf.numPages; i++) {
        const pg = await pdf.getPage(i);
        const scale = 150 / 72;
        const vp = pg.getViewport({ scale });
        const canvas = document.createElement("canvas");
        canvas.width = vp.width; canvas.height = vp.height;
        await pg.render({ canvasContext: canvas.getContext("2d"), viewport: vp }).promise;
        imgs.push({ data: canvas.toDataURL("image/jpeg", 0.85).split(",")[1], media_type: "image/jpeg" });
      }
      addLog(`  → ${imgs.length} page(s) ready`);
      return imgs;
    } else {
      const reader = new FileReader();
      const b64 = await new Promise((res, rej) => {
        reader.onload = e => res(e.target.result.split(",")[1]);
        reader.onerror = rej;
        reader.readAsDataURL(file);
      });
      return [{ data: b64, media_type: file.type }];
    }
  }

  async function runAiExtract() {
    if (!aiFiles.length) { pop?.("Upload at least one plan image or PDF.", "error"); return; }
    setAiRunning(true);
    setAiLog([]);
    try {
      addLog("Preparing plan images…");
      const imageBlocks = [];
      for (const f of aiFiles) {
        const imgs = await fileToBase64Images(f);
        imageBlocks.push(...imgs);
      }
      if (imageBlocks.length > 6) {
        addLog(`Warning: only using first 6 pages (${imageBlocks.length} provided)`, "warn");
        imageBlocks.splice(6);
      }
      addLog(`Sending ${imageBlocks.length} image(s) to AI for cabinet extraction…`);

      const { data: { session } } = await supabase.auth.getSession();
      const headers = { "Content-Type": "application/json" };
      if (session?.access_token) headers["Authorization"] = `Bearer ${session.access_token}`;

      const promptText = [
        `You are a cabinet joinery expert analyzing architectural drawings and joinery schedules for project: "${proj.name}".`,
        `Identify ALL cabinet, joinery, and millwork items visible in the drawings.`,
        `For each item return a JSON object with these exact keys:`,
        `description (string), room (string), cabinet_type (one of: "Base Cabinet","Overhead Cabinet","Pantry Cabinet","Tall Cabinet","Island / Peninsula","Vanity","Linen Tower","Wardrobe","Laundry Cabinet","TV Unit","Custom"),`,
        `width (mm, number), height (mm, number), depth (mm, number), qty (number),`,
        `material (string or ""), door_style (string or ""), door_qty (number), drawer_qty (number),`,
        `has_benchtop (boolean), has_kickboard (boolean),`,
        `unit_type (string, apartment unit type if applicable or ""), level (string, floor level if applicable or ""),`,
        `labour_hours (estimated fabrication hours, number), sell_price (estimated AUD sell price, number),`,
        `ai_confidence (0-100, your confidence this is correct), ai_explanation (brief string).`,
        `Default dimensions: Base 600×720×580mm, Overhead 600×720×350mm, Pantry 600×2100×580mm, Vanity 750×850×450mm.`,
        `Return ONLY a valid JSON array starting with [ and ending with ]. No markdown, no code fences, no explanation outside the array.`,
      ].join(" ");

      const content = [
        { type: "text", text: promptText },
        ...imageBlocks.map(img => ({ type: "image", source: { type: "base64", media_type: img.media_type, data: img.data } })),
      ];

      const r = await fetch("/api/ai", {
        method: "POST",
        headers,
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 8000,
          messages: [{ role: "user", content }],
          meta: { feature: "ai_cabinet_extract", projectId: projectId },
        }),
      });

      const d = await r.json();
      if (d.error) throw new Error(typeof d.error === "object" ? d.error.message : String(d.error));
      const raw = d.content?.map(b => b.text || "").join("") || "";

      addLog("Parsing AI response…");
      let cabinets_parsed;
      try {
        const match = raw.match(/\[[\s\S]*\]/);
        if (!match) throw new Error("No JSON array found in response.");
        cabinets_parsed = JSON.parse(match[0]);
      } catch (e) {
        throw new Error(`Could not parse cabinet data: ${e.message}. Raw response: ${raw.slice(0, 200)}`);
      }

      if (!Array.isArray(cabinets_parsed) || cabinets_parsed.length === 0) {
        throw new Error("AI returned no cabinets. Try a clearer plan image or a more detailed drawing.");
      }

      addLog(`AI identified ${cabinets_parsed.length} cabinet(s). Saving as drafts…`);
      const rows = cabinets_parsed.map((c, i) => ({
        description:     String(c.description || "Cabinet"),
        room:            String(c.room || ""),
        cabinet_type:    String(c.cabinet_type || "Custom"),
        width:           Number(c.width)  || 600,
        height:          Number(c.height) || 720,
        depth:           Number(c.depth)  || 580,
        qty:             Number(c.qty)    || 1,
        material:        String(c.material    || ""),
        door_style:      String(c.door_style  || ""),
        door_qty:        Number(c.door_qty)   || 0,
        drawer_qty:      Number(c.drawer_qty) || 0,
        has_benchtop:    Boolean(c.has_benchtop),
        has_kickboard:   c.has_kickboard !== false,
        unit_type:       String(c.unit_type || ""),
        level:           String(c.level    || ""),
        labour_hours:    Number(c.labour_hours) || 0,
        sell_price:      Number(c.sell_price)   || 0,
        ai_draft:        true,
        ai_source:       "ai_takeoff",
        ai_confidence:   Math.min(100, Math.max(0, Number(c.ai_confidence) || 70)),
        ai_explanation:  String(c.ai_explanation || ""),
        sort_order:      i,
      }));

      const { error } = await createCabinets(projectId, rows);
      if (error) throw new Error(error);

      addLog(`✓ ${rows.length} draft cabinet(s) created. Review them in the Draft Review banner above.`, "success");
      setAiFiles([]);
      if (aiFileRef.current) aiFileRef.current.value = "";
      load();
    } catch (e) {
      addLog(`Error: ${e.message}`, "error");
      pop?.(e.message, "error");
    } finally {
      setAiRunning(false);
    }
  }

  const fmt = v => `$${Number(v).toLocaleString("en-AU", { minimumFractionDigits: 0 })}`;

  function exportCSV() {
    const esc = v => String(v ?? "").replace(/,/g, " ").replace(/\n/g, " ");
    const rows = [
      ["Cab #","Type","Description","Room","Unit Type","Joinery","Level","Building",
       "Width","Height","Depth","Doors","Drawers","Material","Door Style",
       "Sell Price","Unit Cost","Labour Hrs","Status","AI Source"],
      ...cabinets.map(c=>[
        esc(c.cabinet_number), esc(c.cabinet_type), esc(c.description||c.cabinet_type),
        esc(c.room), esc(c.unit_type), esc(c.joinery_type), esc(c.level), esc(c.building),
        c.width||"", c.height||"", c.depth||"",
        c.door_qty||0, c.drawer_qty||0,
        esc(c.material), esc(c.door_style),
        Number(c.sell_price||0).toFixed(2),
        Number(c.unit_cost||0).toFixed(2),
        Number(c.labour_hours||0).toFixed(1),
        c.status||"pending",
        c.ai_source||"manual",
      ]),
    ];
    const csv = rows.map(r=>r.join(",")).join("\n");
    const a = document.createElement("a");
    a.href = "data:text/csv;charset=utf-8,"+encodeURIComponent(csv);
    a.download = `cabinets-${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div style={{ color: T.muted, fontSize: 13, padding: "40px 0", textAlign: "center" }}>
        Loading cabinet database…
      </div>
    );
  }

  return (
    <div>
      {/* ── Summary KPIs ── */}
      <div style={{ display: "flex", gap: 10, marginBottom: 18, flexWrap: "wrap" }}>
        {[
          { label: "Total Cabinets",  value: cabinets.length,       unit: "" },
          { label: "Sell Price",      value: fmt(totalSell),         unit: "" },
          { label: "Total Cost",      value: fmt(totalCost),         unit: "" },
          { label: "Labour",          value: `${totalLabour.toFixed(1)}h`, unit: "" },
          { label: "Draft (AI)",      value: draftCabinets.length,   unit: "" },
        ].map(kpi => (
          <div key={kpi.label} style={{ flex: 1, minWidth: 120, background: T.card, border: `1px solid ${T.border}`, borderRadius: 7, padding: "12px 14px" }}>
            <div style={{ fontSize: 10, color: T.faint, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 5 }}>{kpi.label}</div>
            <div style={{ fontSize: 18, fontWeight: 800, color: T.accent, fontFamily: "monospace" }}>{kpi.value}</div>
          </div>
        ))}
      </div>

      {/* ── AI Extract from Plans ── */}
      <div style={{ marginBottom: 14 }}>
        <button
          onClick={() => { setAiOpen(o => !o); setAiLog([]); }}
          style={{
            background: aiOpen ? "rgba(139,92,246,0.15)" : T.card,
            color: aiOpen ? "#a78bfa" : T.muted,
            border: `1px solid ${aiOpen ? "rgba(139,92,246,0.4)" : T.border}`,
            borderRadius: 6, padding: "7px 14px", fontSize: 12, fontWeight: 700,
            cursor: "pointer", display: "flex", alignItems: "center", gap: 6,
          }}>
          ✦ AI Extract from Plans {aiOpen ? "▲" : "▼"}
        </button>

        {aiOpen && (
          <div style={{
            marginTop: 8, background: "rgba(139,92,246,0.06)",
            border: "1px solid rgba(139,92,246,0.25)", borderRadius: 8, padding: "16px 18px",
          }}>
            <div style={{ fontSize: 12, color: "#94a3b8", marginBottom: 12 }}>
              Upload architectural drawings or joinery schedules (PDF, PNG, JPG). The AI will identify all cabinets and create them as drafts for your review.
            </div>

            <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginBottom: 12 }}>
              <input
                ref={aiFileRef}
                type="file"
                accept=".pdf,.png,.jpg,.jpeg"
                multiple
                onChange={e => setAiFiles(Array.from(e.target.files || []))}
                style={{ display: "none" }}
              />
              <button
                onClick={() => aiFileRef.current?.click()}
                style={{
                  background: T.card, color: T.text, border: `1px solid ${T.border}`,
                  borderRadius: 5, padding: "7px 14px", fontSize: 12, fontWeight: 600, cursor: "pointer",
                }}>
                📁 {aiFiles.length ? `${aiFiles.length} file(s) selected` : "Choose plans…"}
              </button>
              {aiFiles.length > 0 && (
                <span style={{ fontSize: 11, color: "#94a3b8" }}>
                  {aiFiles.map(f => f.name).join(", ")}
                </span>
              )}
              <button
                onClick={runAiExtract}
                disabled={aiRunning || !aiFiles.length}
                style={{
                  background: aiRunning || !aiFiles.length ? "#1e293b" : "#7c3aed",
                  color: aiRunning || !aiFiles.length ? "#475569" : "#fff",
                  border: "none", borderRadius: 5, padding: "7px 18px",
                  fontSize: 12, fontWeight: 700, cursor: aiRunning || !aiFiles.length ? "not-allowed" : "pointer",
                }}>
                {aiRunning ? "Extracting…" : "✦ Extract Cabinets"}
              </button>
            </div>

            {aiLog.length > 0 && (
              <div style={{
                background: "#0d1117", borderRadius: 5, padding: "10px 12px",
                fontFamily: "monospace", fontSize: 11, lineHeight: 1.8, maxHeight: 180, overflowY: "auto",
              }}>
                {aiLog.map((entry, i) => (
                  <div key={i} style={{
                    color: entry.type === "error" ? "#f87171"
                         : entry.type === "success" ? "#4ade80"
                         : entry.type === "warn" ? "#fbbf24"
                         : "#94a3b8",
                  }}>
                    {entry.msg}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Draft review banner ── */}
      {draftCabinets.length > 0 && (
        <DraftReviewBanner
          draftCabinets={draftCabinets}
          onApproveAll={handleApproveAll}
          onDiscardAll={handleDiscardAll}
          onFilter={() => setFilteringDraft(f => !f)}
          filteringDraft={filteringDraft}
          T={T}
        />
      )}

      {/* ── Toolbar ── */}
      <div style={{ display: "flex", gap: 10, marginBottom: 14, flexWrap: "wrap", alignItems: "center" }}>
        <input
          placeholder="Search cabinets…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{
            flex: 1, minWidth: 180,
            background: T.card, color: T.text, border: `1px solid ${T.border}`,
            borderRadius: 5, padding: "7px 11px", fontSize: 13, fontFamily: T.font,
            outline: "none",
          }}
          onFocus={e => e.target.style.borderColor = T.accent}
          onBlur={e => e.target.style.borderColor = T.border}
        />

        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
          style={{
            background: T.card, color: statusFilter ? T.accent : T.muted,
            border: `1px solid ${statusFilter ? T.accent : T.border}`, borderRadius: 5,
            padding: "7px 10px", fontSize: 12, cursor: "pointer", outline: "none",
          }}>
          <option value="">All statuses</option>
          {STATUSES.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
        </select>

        <div style={{ display: "flex", gap: 2, background: T.card2, border: `1px solid ${T.border}`, borderRadius: 5, overflow: "hidden" }}>
          {[
            { k: "room",         label: "Room" },
            { k: "unit_type",    label: "Unit Type" },
            { k: "joinery_type", label: "Joinery" },
            { k: "status",       label: "Status" },
            { k: "none",         label: "All" },
          ].map(g => (
            <button key={g.k} onClick={() => setGroupBy(g.k)}
              style={{
                background: groupBy === g.k ? T.accent : "transparent",
                color: groupBy === g.k ? "#000" : T.muted,
                border: "none", padding: "6px 10px", fontSize: 11, fontWeight: 600,
                cursor: "pointer", whiteSpace: "nowrap",
              }}>
              {g.label}
            </button>
          ))}
        </div>

        <button
          onClick={() => setEditingId("new")}
          style={{ background: T.accent, color: "#000", border: "none", borderRadius: 5, padding: "7px 16px", fontWeight: 800, fontSize: 13, cursor: "pointer" }}>
          + Add Cabinet
        </button>

        {cabinets.length > 0 && (
          <button
            onClick={exportCSV}
            style={{ background: "transparent", color: T.muted, border: `1px solid ${T.border}`, borderRadius: 5, padding: "7px 12px", fontSize: 12, cursor: "pointer", whiteSpace: "nowrap" }}>
            ↓ CSV
          </button>
        )}
      </div>

      {/* ── New cabinet editor (full width, outside scroll area) ── */}
      {editingId === "new" && (
        <CabinetEditor
          cab={BLANK_CABINET}
          onSave={handleSaveNew}
          onCancel={() => setEditingId(null)}
          T={T}
          isMobile={isMobile}
        />
      )}

      {/* ── Cabinet groups — horizontal scroll on mobile ── */}
      {filtered.length === 0 && editingId !== "new" && (
        <div style={{ textAlign: "center", padding: "40px 0", color: T.faint, fontSize: 13 }}>
          {cabinets.length === 0
            ? "No cabinets yet. Click \"+ Add Cabinet\" to start building your cabinet database."
            : "No cabinets match the current filter."}
        </div>
      )}

      <div style={{ overflowX: "auto" }}>
        {/* Column headers */}
        {filtered.length > 0 && <div style={{
          display: "grid", gridTemplateColumns: "80px 1fr 80px 80px 80px 100px 130px 80px",
          gap: "0 10px", padding: "5px 14px", marginBottom: 4, minWidth: 680,
          fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase",
          color: T.faint,
        }}>
          <div>Cab #</div>
          <div>Description / Location</div>
          <div>W×H×D</div>
          <div>Doors</div>
          <div>Sell</div>
          <div>AI</div>
          <div>Status</div>
          <div />
        </div>}

        {Object.entries(groups).map(([groupLabel, cabs]) => {
          const groupSell = cabs.reduce((s, c) => s + Number(c.sell_price || 0), 0);
          const collapsed = collapsedGroups[groupLabel];
          return (
            <div key={groupLabel} style={{ marginBottom: 8, minWidth: 680 }}>
              <GroupHeader
                label={groupLabel}
                count={cabs.length}
                totalSell={groupSell}
                expanded={!collapsed}
                onToggle={() => toggleGroup(groupLabel)}
                T={T}
              />
              {!collapsed && cabs.map(cab => (
                editingId === cab.id
                  ? <CabinetEditor
                      key={cab.id}
                      cab={cab}
                      onSave={handleSaveExisting}
                      onCancel={() => setEditingId(null)}
                      onApprove={handleApprove}
                      T={T}
                      isMobile={isMobile}
                    />
                  : <CabinetRow
                      key={cab.id}
                      cab={cab}
                      onEdit={c => setEditingId(c.id)}
                      onDelete={handleDelete}
                      onStatusChange={handleStatusChange}
                      T={T}
                    />
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}
