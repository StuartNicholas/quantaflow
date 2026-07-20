"use client";
// ─────────────────────────────────────────────────────────────────────────────
// ProjectSetup — the first screen after creating a project.
// Captures all project presets before the estimator enters the workflow.
// Can also be accessed any time from the Project Info tab.
// ─────────────────────────────────────────────────────────────────────────────

import { useState } from "react";

const CURRENCIES = [
  { value: "AUD", label: "AUD — Australian Dollar" },
  { value: "NZD", label: "NZD — New Zealand Dollar" },
  { value: "USD", label: "USD — US Dollar" },
  { value: "GBP", label: "GBP — British Pound" },
  { value: "SGD", label: "SGD — Singapore Dollar" },
];

const BREAKDOWN_PREFS = [
  { value: "unit_type",    label: "Unit Type — group cabinets by apartment / dwelling type" },
  { value: "joinery_type", label: "Joinery Type — group by joinery category (kitchen, laundry, etc.)" },
  { value: "unit_number",  label: "Unit Number — individual cabinet-by-cabinet pricing" },
];

const GST_RATES = [
  { value: "10", label: "10% — Australia" },
  { value: "15", label: "15% — New Zealand" },
  { value: "0",  label: "0% — Exempt / Export" },
  { value: "20", label: "20% — UK VAT" },
  { value: "custom", label: "Custom…" },
];

export default function ProjectSetup({ proj, clients, builders, company, onSave, onCancel, T, isModal = false }) {
  const [form, setForm] = useState({
    name:                      proj?.name                      || "",
    address:                   proj?.address                   || "",
    client_id:                 proj?.clientId                  || proj?.client_id || "",
    builder_id:                proj?.builder_id                || "",
    tender_number:             proj?.tender_number             || "",
    project_number:            proj?.project_number            || "",
    revision:                  proj?.revision                  || "1",
    estimator:                 proj?.estimator                 || "",
    gst:                       String(proj?.gst               ?? company?.defaultGst ?? 10),
    currency:                  proj?.currency                  || company?.currency || "AUD",
    breakdown_preference:      proj?.breakdown_preference      || "unit_type",
    default_trade_scope:       proj?.default_trade_scope       || "",
    default_pricing_library:   proj?.default_pricing_library   || "",
    default_material_library:  proj?.default_material_library  || "",
    default_hardware_library:  proj?.default_hardware_library  || "",
  });
  const [customGst, setCustomGst] = useState(
    !["0","10","15","20"].includes(String(proj?.gst ?? "")) ? String(proj?.gst ?? "10") : ""
  );
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  const gstIsCustom = !["0","10","15","20"].includes(form.gst);

  function set(k, v) { setForm(f => ({ ...f, [k]: v })); }

  async function handleSave() {
    if (!form.name.trim()) return setErr("Project name is required.");
    setErr(null);
    setBusy(true);
    const patch = {
      ...form,
      gst:                    gstIsCustom ? parseFloat(customGst) || 10 : parseFloat(form.gst) || 10,
      client_id:              form.client_id || null,
      builder_id:             form.builder_id || null,
      project_setup_complete: true,
    };
    await onSave(patch);
    setBusy(false);
  }

  const inputStyle = {
    width: "100%", boxSizing: "border-box",
    background: T.card2, color: T.text,
    border: `1px solid ${T.border}`, borderRadius: 6,
    padding: "9px 11px", fontSize: 13, outline: "none",
    fontFamily: T.font,
  };
  const labelStyle = { fontSize: 11, color: T.muted, marginBottom: 5, display: "block", fontWeight: 600, letterSpacing: "0.04em" };
  const fieldStyle = { marginBottom: 16 };
  const sectionStyle = { marginBottom: 24, paddingBottom: 24, borderBottom: `1px solid ${T.border}` };
  const sectionTitleStyle = { fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: T.accent, marginBottom: 16 };
  const gridStyle = { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 16px" };

  const Field = ({ label, children }) => (
    <div style={fieldStyle}>
      <label style={labelStyle}>{label}</label>
      {children}
    </div>
  );

  const Input = ({ k, placeholder, type = "text" }) => (
    <input
      type={type}
      value={form[k]}
      onChange={e => set(k, e.target.value)}
      placeholder={placeholder || ""}
      style={inputStyle}
      onFocus={e => e.target.style.borderColor = T.accent}
      onBlur={e => e.target.style.borderColor = T.border}
    />
  );

  const Select = ({ k, options }) => (
    <select
      value={form[k]}
      onChange={e => set(k, e.target.value)}
      style={{ ...inputStyle, cursor: "pointer" }}>
      <option value="">— Select —</option>
      {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );

  const wrap = isModal
    ? { position: "fixed", inset: 0, zIndex: 9000, background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "40px 16px", overflowY: "auto" }
    : {};

  const inner = {
    background: T.panel, borderRadius: isModal ? 12 : 0,
    border: isModal ? `1px solid ${T.border}` : "none",
    padding: 32, width: "100%", maxWidth: 680,
    ...(isModal ? {} : {}),
  };

  return (
    <div style={wrap}>
      <div style={inner}>
        {/* Header */}
        <div style={{ marginBottom: 28 }}>
          <div style={{ fontSize: 11, color: T.accent, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 8 }}>
            Project Setup
          </div>
          <div style={{ fontSize: 20, fontWeight: 800, color: T.text, marginBottom: 6 }}>
            {proj?.name ? `Configure: ${proj.name}` : "New Project Setup"}
          </div>
          <div style={{ fontSize: 13, color: T.muted, lineHeight: 1.6 }}>
            These presets are saved with the project and can be edited at any time from the Project Info tab.
          </div>
        </div>

        {err && (
          <div style={{ background: T.redDim, border: `1px solid ${T.red}55`, borderRadius: 6, padding: "10px 14px", fontSize: 13, color: T.red, marginBottom: 16 }}>
            {err}
          </div>
        )}

        {/* ── Section 1: Identity ── */}
        <div style={sectionStyle}>
          <div style={sectionTitleStyle}>Project Identity</div>
          <Field label="Project Name *">
            <Input k="name" placeholder="e.g. 42 Maple Street Kitchen" />
          </Field>
          <Field label="Project Address">
            <Input k="address" placeholder="Full project address" />
          </Field>
          <div style={gridStyle}>
            <Field label="Project Number">
              <Input k="project_number" placeholder="e.g. PRJ-2026-041" />
            </Field>
            <Field label="Tender Number">
              <Input k="tender_number" placeholder="e.g. TND-1045" />
            </Field>
            <Field label="Revision">
              <Input k="revision" placeholder="1" />
            </Field>
            <Field label="Estimator">
              <Input k="estimator" placeholder="Name of the estimator" />
            </Field>
          </div>
        </div>

        {/* ── Section 2: Parties ── */}
        <div style={sectionStyle}>
          <div style={sectionTitleStyle}>Client & Builder</div>
          <div style={gridStyle}>
            <Field label="Client">
              <Select k="client_id" options={(clients || []).map(c => ({ value: c.id, label: c.name }))} />
            </Field>
            <Field label="Builder / Principal Contractor">
              <Select k="builder_id" options={(builders || []).map(b => ({ value: b.id, label: b.name }))} />
            </Field>
          </div>
        </div>

        {/* ── Section 3: Financial defaults ── */}
        <div style={sectionStyle}>
          <div style={sectionTitleStyle}>Financial Defaults</div>
          <div style={gridStyle}>
            <Field label="Currency">
              <Select k="currency" options={CURRENCIES} />
            </Field>
            <Field label="GST / Tax Rate">
              <select
                value={gstIsCustom ? "custom" : form.gst}
                onChange={e => {
                  if (e.target.value === "custom") {
                    set("gst", "custom");
                  } else {
                    set("gst", e.target.value);
                  }
                }}
                style={{ ...inputStyle, cursor: "pointer" }}>
                {GST_RATES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
            </Field>
          </div>
          {gstIsCustom && (
            <Field label="Custom GST Rate (%)">
              <input
                type="number" min="0" max="100" step="0.5"
                value={customGst}
                onChange={e => setCustomGst(e.target.value)}
                style={inputStyle}
                onFocus={e => e.target.style.borderColor = T.accent}
                onBlur={e => e.target.style.borderColor = T.border}
              />
            </Field>
          )}
          <Field label="Project Breakdown Preference">
            <select
              value={form.breakdown_preference}
              onChange={e => set("breakdown_preference", e.target.value)}
              style={{ ...inputStyle, cursor: "pointer" }}>
              {BREAKDOWN_PREFS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
            </select>
          </Field>
        </div>

        {/* ── Section 4: Libraries ── */}
        <div style={{ marginBottom: 28 }}>
          <div style={sectionTitleStyle}>Default Libraries</div>
          <div style={{ fontSize: 12, color: T.faint, marginBottom: 14 }}>
            These link the project to specific pricing, material, and hardware libraries. Leave blank to use company defaults.
          </div>
          <div style={gridStyle}>
            <Field label="Default Trade Scope">
              <Input k="default_trade_scope" placeholder="e.g. Supply & Install" />
            </Field>
            <Field label="Default Pricing Library">
              <Input k="default_pricing_library" placeholder="e.g. Standard 2026" />
            </Field>
            <Field label="Default Material Library">
              <Input k="default_material_library" placeholder="e.g. Polytec Colour Range" />
            </Field>
            <Field label="Default Hardware Library">
              <Input k="default_hardware_library" placeholder="e.g. Blum Standard" />
            </Field>
          </div>
        </div>

        {/* ── Actions ── */}
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          {onCancel && (
            <button
              onClick={onCancel}
              style={{ background: "none", border: `1px solid ${T.border}`, color: T.muted, borderRadius: 6, padding: "10px 20px", fontSize: 13, cursor: "pointer", fontFamily: T.font }}>
              Cancel
            </button>
          )}
          <button
            onClick={handleSave}
            disabled={busy}
            style={{ background: T.accent, color: "#000", border: "none", borderRadius: 6, padding: "10px 28px", fontWeight: 800, fontSize: 14, cursor: busy ? "not-allowed" : "pointer", opacity: busy ? 0.7 : 1, fontFamily: T.font }}>
            {busy ? "Saving…" : "Save & Continue →"}
          </button>
        </div>
      </div>
    </div>
  );
}
