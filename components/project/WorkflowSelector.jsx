"use client";
// ─────────────────────────────────────────────────────────────────────────────
// WorkflowSelector — choose how to build this project's cabinet database.
// Shown once after project setup, before entering the cabinet workspace.
// The selected mode is saved on the project and can be changed from Project Info.
// ─────────────────────────────────────────────────────────────────────────────

import { useState } from "react";

const MODES = [
  {
    id: "manual",
    icon: "✏️",
    title: "Manual Estimating",
    badge: null,
    description: "Traditional estimating. You create every cabinet, room, and unit type yourself — no AI involved.",
    features: [
      "Full control over every cabinet",
      "Create rooms, levels, and unit types manually",
      "Build your cabinet database item by item",
      "No AI required — works entirely offline",
      "Best for: familiar jobs, small projects, precise control",
    ],
    color: null, // uses accent
    available: true,
  },
  {
    id: "ai_assisted",
    icon: "🤖",
    title: "AI Assisted Estimating",
    badge: "AI",
    description: "You create the rooms. AI suggests cabinets, dimensions, hardware, and fillers. You approve or edit everything — nothing is locked.",
    features: [
      "You define rooms and unit types",
      "AI suggests cabinets and dimensions per room",
      "Hardware, fillers, and panel assumptions shown",
      "Every suggestion is editable before approval",
      "Confidence scores on all AI suggestions",
      "Best for: standard residential and commercial jobs",
    ],
    color: "#8b5cf6",
    available: true,
  },
  {
    id: "ai_takeoff",
    icon: "📐",
    title: "AI Architectural Takeoff",
    badge: "AI",
    description: "Upload architectural drawings. AI creates levels, unit types, rooms, and an initial cabinet database. You review and approve everything in a draft stage.",
    features: [
      "Upload PDF or image architectural drawings",
      "AI detects levels, unit types, and room layouts",
      "AI creates initial cabinet schedule with dimensions",
      "Full draft review before anything goes live",
      "Every AI decision has an explanation and confidence score",
      "Red / yellow / green confidence filtering for review",
      "Best for: multi-level residential and commercial projects",
    ],
    color: "#3b82f6",
    available: true,
  },
];

export default function WorkflowSelector({ proj, entitlement, onSelect, onBack, T }) {
  const [selected, setSelected] = useState(proj?.workflow_mode || null);
  const [hovering, setHovering] = useState(null);

  const aiAvailable = entitlement?.ai_enabled === true;

  function handleSelect(modeId) {
    const mode = MODES.find(m => m.id === modeId);
    if (!mode?.available) return;
    if (mode.badge === "AI" && !aiAvailable) return;
    setSelected(modeId);
  }

  function handleConfirm() {
    if (!selected) return;
    onSelect(selected);
  }

  return (
    <div style={{ maxWidth: 780, margin: "0 auto", padding: "32px 16px" }}>
      {/* Header */}
      <div style={{ marginBottom: 32 }}>
        <div style={{ fontSize: 11, color: T.accent, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 8 }}>
          Choose Workflow
        </div>
        <div style={{ fontSize: 22, fontWeight: 800, color: T.text, marginBottom: 8 }}>
          How would you like to build <span style={{ color: T.accent }}>{proj?.name || "this project"}</span>?
        </div>
        <div style={{ fontSize: 13, color: T.muted, lineHeight: 1.6, maxWidth: 560 }}>
          This sets how your cabinet database is created. You can switch methods later from Project Info — your existing data is never affected.
        </div>
      </div>

      {/* Mode cards */}
      <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 28 }}>
        {MODES.map(mode => {
          const isSelected = selected === mode.id;
          const isAiMode = mode.badge === "AI";
          const locked = isAiMode && !aiAvailable;
          const color = mode.color || T.accent;
          const hov = hovering === mode.id && !locked;

          return (
            <div
              key={mode.id}
              onClick={() => handleSelect(mode.id)}
              onMouseEnter={() => setHovering(mode.id)}
              onMouseLeave={() => setHovering(null)}
              style={{
                background: isSelected ? `${color}12` : T.card,
                border: `2px solid ${isSelected ? color : hov ? `${color}60` : T.border}`,
                borderRadius: 10,
                padding: "20px 22px",
                cursor: locked ? "not-allowed" : "pointer",
                opacity: locked ? 0.5 : 1,
                transition: "all 0.15s",
                position: "relative",
              }}>

              {/* Badge */}
              {isAiMode && (
                <div style={{
                  position: "absolute", top: 16, right: 16,
                  background: locked ? T.border : `${color}22`,
                  color: locked ? T.faint : color,
                  border: `1px solid ${locked ? T.border : `${color}44`}`,
                  borderRadius: 4, padding: "2px 8px",
                  fontSize: 10, fontWeight: 700, letterSpacing: "0.08em",
                }}>
                  {locked ? "AI NOT ENABLED" : "AI POWERED"}
                </div>
              )}

              <div style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
                {/* Selection circle */}
                <div style={{
                  width: 22, height: 22, borderRadius: "50%",
                  border: `2px solid ${isSelected ? color : T.border}`,
                  background: isSelected ? color : "transparent",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  flexShrink: 0, marginTop: 2,
                }}>
                  {isSelected && <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#000" }} />}
                </div>

                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                    <span style={{ fontSize: 18 }}>{mode.icon}</span>
                    <span style={{ fontSize: 15, fontWeight: 800, color: isSelected ? color : T.text }}>{mode.title}</span>
                  </div>
                  <div style={{ fontSize: 13, color: T.muted, lineHeight: 1.6, marginBottom: 12 }}>
                    {mode.description}
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px 16px" }}>
                    {mode.features.map((f, i) => (
                      <div key={i} style={{ fontSize: 12, color: isSelected ? T.text : T.faint, display: "flex", gap: 6, alignItems: "flex-start" }}>
                        <span style={{ color: isSelected ? color : T.faint, marginTop: 1 }}>✓</span>
                        <span>{f}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* AI disabled notice */}
      {!aiAvailable && (
        <div style={{
          background: T.accentDim, border: `1px solid ${T.accentBrd}`,
          borderRadius: 7, padding: "12px 16px", marginBottom: 20,
          fontSize: 13, color: T.accent,
        }}>
          <strong>AI features are not enabled for your account.</strong>{" "}
          Contact your administrator or visit Billing to enable AI-powered estimating.
        </div>
      )}

      {/* Actions */}
      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
        {onBack && (
          <button
            onClick={onBack}
            style={{ background: "none", border: `1px solid ${T.border}`, color: T.muted, borderRadius: 6, padding: "10px 18px", fontSize: 13, cursor: "pointer", fontFamily: T.font }}>
            ← Back
          </button>
        )}
        <button
          onClick={handleConfirm}
          disabled={!selected}
          style={{
            background: selected ? T.accent : T.card2,
            color: selected ? "#000" : T.faint,
            border: "none", borderRadius: 6, padding: "11px 28px",
            fontWeight: 800, fontSize: 14, cursor: selected ? "pointer" : "not-allowed",
            fontFamily: T.font, transition: "all 0.15s",
          }}>
          {selected ? `Start with ${MODES.find(m => m.id === selected)?.title} →` : "Select a workflow to continue"}
        </button>
      </div>
    </div>
  );
}
