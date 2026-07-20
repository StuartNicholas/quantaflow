"use client";
// ─────────────────────────────────────────────────────────────────────────────
// BoxMatrix — live spreadsheet view of the entire cabinet database.
// Layout modelled on the Omen Cabinets production sheet.
// Reads directly from the cabinets table. Any cabinet change in CabinetDatabase
// is immediately reflected here — no data duplication.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect, useCallback } from "react";
import { getAllCabinets, updateCabinet } from "../../lib/db/cabinets";

const STATUS_COLS = [
  { key: "cutting",    label: "Cut",      short: "CUT" },
  { key: "assembled",  label: "Assembly", short: "ASM" },
  { key: "qc",         label: "QC",       short: "QC"  },
  { key: "dispatched", label: "Dispatch", short: "DSP" },
  { key: "installed",  label: "Install",  short: "INS" },
];

const STATUS_ORDER = ["pending", "cutting", "assembled", "qc", "dispatched", "installed"];
const STATUS_COLOR = {
  pending:    "#6b7280",
  cutting:    "#d97706",
  assembled:  "#7c3aed",
  qc:         "#2563eb",
  dispatched: "#0891b2",
  installed:  "#16a34a",
};

function statusReached(current, check) {
  return STATUS_ORDER.indexOf(current) >= STATUS_ORDER.indexOf(check);
}

// ── Status cell toggle ────────────────────────────────────────────────────────

function StatusCell({ cabinetId, currentStatus, colStatus, onChange, T }) {
  const reached = statusReached(currentStatus, colStatus);
  const isNext = STATUS_ORDER.indexOf(currentStatus) + 1 === STATUS_ORDER.indexOf(colStatus);
  const color = STATUS_COLOR[colStatus] || T.faint;

  return (
    <td
      onClick={() => {
        const newStatus = reached && !isNext
          ? STATUS_ORDER[STATUS_ORDER.indexOf(colStatus) - 1] || "pending"
          : colStatus;
        onChange(cabinetId, reached ? "pending" : colStatus);
      }}
      title={reached ? `Undo to before ${colStatus}` : `Mark as ${colStatus}`}
      style={{
        textAlign: "center", cursor: "pointer", userSelect: "none",
        background: reached ? `${color}18` : "transparent",
        borderBottom: `1px solid ${T.border}`,
        borderRight: `1px solid ${T.border}`,
        padding: "6px 8px",
        transition: "background 0.1s",
      }}
      onMouseEnter={e => e.currentTarget.style.background = `${color}30`}
      onMouseLeave={e => e.currentTarget.style.background = reached ? `${color}18` : "transparent"}>
      <span style={{
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        width: 18, height: 18, borderRadius: 3,
        background: reached ? color : "transparent",
        border: `2px solid ${reached ? color : T.faint}`,
        color: reached ? "#fff" : T.faint,
        fontSize: 10, fontWeight: 700,
      }}>
        {reached ? "✓" : ""}
      </span>
    </td>
  );
}

// ── Confidence indicator ──────────────────────────────────────────────────────

function ConfDot({ score }) {
  if (score === null || score === undefined) return null;
  const n = Number(score);
  const color = n >= 90 ? "#16a34a" : n >= 70 ? "#d97706" : "#dc2626";
  return <span title={`AI confidence: ${n}%`} style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: color, marginRight: 4 }} />;
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function BoxMatrix({ proj, T, pop }) {
  const projectId = proj?.id;
  const [cabinets,  setCabinets]  = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [groupBy,   setGroupBy]   = useState("unit_type");
  const [filterStatus, setFilterStatus] = useState("all");
  const [search, setSearch] = useState("");
  const [collapsedGroups, setCollapsedGroups] = useState({});

  const load = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    const { data } = await getAllCabinets(projectId);
    setCabinets(data || []);
    setLoading(false);
  }, [projectId]);

  useEffect(() => { load(); }, [load]);

  async function handleStatusChange(id, newStatus) {
    await updateCabinet(id, { status: newStatus });
    setCabinets(prev => prev.map(c => c.id === id ? { ...c, status: newStatus } : c));
  }

  // ── Filtered cabinets ────────────────────────────────────────────────────────

  const liveCabinets = cabinets.filter(c => !c.ai_draft);
  const filtered = liveCabinets.filter(c => {
    if (filterStatus !== "all" && c.status !== filterStatus) return false;
    if (search && !`${c.cabinet_number} ${c.description} ${c.room} ${c.unit_type}`.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  function groupKey(c) {
    if (groupBy === "unit_type")    return c.unit_type    || "Unassigned";
    if (groupBy === "joinery_type") return c.joinery_type || "Unassigned";
    if (groupBy === "building")     return c.building     || "Site";
    if (groupBy === "level")        return c.level        || "Level —";
    if (groupBy === "room")         return c.room         || "Unassigned";
    return "All";
  }

  const groups = {};
  for (const c of filtered) {
    const k = groupKey(c);
    if (!groups[k]) groups[k] = [];
    groups[k].push(c);
  }

  // ── Totals ──────────────────────────────────────────────────────────────────

  const installed  = liveCabinets.filter(c => c.status === "installed").length;
  const dispatched = liveCabinets.filter(c => statusReached(c.status, "dispatched")).length;
  const assembled  = liveCabinets.filter(c => statusReached(c.status, "assembled")).length;
  const cutting    = liveCabinets.filter(c => statusReached(c.status, "cutting")).length;
  const totalSell  = liveCabinets.reduce((s, c) => s + Number(c.sell_price || 0), 0);
  const totalCost  = liveCabinets.reduce((s, c) => s + Number(c.unit_cost  || 0), 0);

  const cellStyle = {
    padding: "7px 10px",
    borderBottom: `1px solid ${T.border}`,
    borderRight: `1px solid ${T.border}`,
    fontSize: 12,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
    maxWidth: 180,
  };

  const thStyle = {
    padding: "8px 10px",
    fontSize: 10, fontWeight: 700,
    letterSpacing: "0.08em", textTransform: "uppercase",
    color: T.faint,
    background: T.card2,
    borderBottom: `1px solid ${T.border}`,
    borderRight: `1px solid ${T.border}`,
    whiteSpace: "nowrap",
    position: "sticky", top: 0, zIndex: 10,
  };

  if (loading) return <div style={{ color: T.muted, padding: "40px 0", textAlign: "center", fontSize: 13 }}>Loading Box Matrix…</div>;

  return (
    <div>
      {/* ── Production summary bar ── */}
      <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
        {[
          { label: "Total",       value: liveCabinets.length,  color: T.text    },
          { label: "In Cutting",  value: cutting,              color: "#d97706" },
          { label: "Assembled",   value: assembled,            color: "#7c3aed" },
          { label: "Dispatched",  value: dispatched,           color: "#0891b2" },
          { label: "Installed",   value: installed,            color: "#16a34a" },
          { label: "Sell Total",  value: `$${Number(totalSell).toLocaleString("en-AU", { minimumFractionDigits: 0 })}`, color: T.accent },
          { label: "Cost Total",  value: `$${Number(totalCost).toLocaleString("en-AU", { minimumFractionDigits: 0 })}`, color: T.muted },
        ].map(kpi => (
          <div key={kpi.label} style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 6, padding: "10px 14px", minWidth: 100 }}>
            <div style={{ fontSize: 10, color: T.faint, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 4 }}>{kpi.label}</div>
            <div style={{ fontSize: 16, fontWeight: 800, color: kpi.color, fontFamily: "monospace" }}>{kpi.value}</div>
          </div>
        ))}
      </div>

      {/* ── Progress bar ── */}
      <div style={{ background: T.card, borderRadius: 6, height: 10, marginBottom: 18, overflow: "hidden", border: `1px solid ${T.border}` }}>
        {liveCabinets.length > 0 && (
          <div style={{
            height: "100%",
            background: `linear-gradient(90deg, #16a34a ${installed/liveCabinets.length*100}%, #0891b2 ${dispatched/liveCabinets.length*100}%, #7c3aed ${assembled/liveCabinets.length*100}%, #d97706 ${cutting/liveCabinets.length*100}%, ${T.border} 100%)`,
            transition: "width 0.4s",
          }} />
        )}
      </div>

      {/* ── Toolbar ── */}
      <div style={{ display: "flex", gap: 10, marginBottom: 14, flexWrap: "wrap", alignItems: "center" }}>
        <input
          placeholder="Search…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ flex: 1, minWidth: 160, background: T.card, color: T.text, border: `1px solid ${T.border}`, borderRadius: 5, padding: "6px 10px", fontSize: 12, fontFamily: T.font, outline: "none" }}
          onFocus={e => e.target.style.borderColor = T.accent}
          onBlur={e => e.target.style.borderColor = T.border}
        />

        <div style={{ display: "flex", gap: 2, background: T.card2, border: `1px solid ${T.border}`, borderRadius: 5, overflow: "hidden" }}>
          {[
            { k: "unit_type",    l: "Unit Type" },
            { k: "joinery_type", l: "Joinery" },
            { k: "building",     l: "Building" },
            { k: "level",        l: "Level" },
            { k: "room",         l: "Room" },
          ].map(g => (
            <button key={g.k} onClick={() => setGroupBy(g.k)}
              style={{ background: groupBy === g.k ? T.accent : "transparent", color: groupBy === g.k ? "#000" : T.muted, border: "none", padding: "6px 10px", fontSize: 11, fontWeight: 600, cursor: "pointer" }}>
              {g.l}
            </button>
          ))}
        </div>

        <select
          value={filterStatus}
          onChange={e => setFilterStatus(e.target.value)}
          style={{ background: T.card2, color: T.text, border: `1px solid ${T.border}`, borderRadius: 5, padding: "6px 10px", fontSize: 12, cursor: "pointer" }}>
          <option value="all">All Statuses</option>
          {STATUS_ORDER.map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
        </select>
      </div>

      {/* ── Matrix table ── */}
      {filtered.length === 0 ? (
        <div style={{ textAlign: "center", color: T.faint, padding: "40px 0", fontSize: 13 }}>
          {liveCabinets.length === 0 ? "Add cabinets in the Cabinet Database tab to see the Box Matrix." : "No cabinets match the filter."}
        </div>
      ) : (
        <div style={{ overflowX: "auto", border: `1px solid ${T.border}`, borderRadius: 7 }}>
          <table style={{ width: "100%", borderCollapse: "collapse", background: T.card }}>
            <thead>
              <tr>
                <th style={{ ...thStyle, width: 30, textAlign: "center" }}>#</th>
                <th style={{ ...thStyle, width: 70 }}>Cab #</th>
                <th style={{ ...thStyle, minWidth: 200 }}>Description</th>
                <th style={{ ...thStyle, width: 80 }}>Type</th>
                <th style={{ ...thStyle, width: 60 }}>W (mm)</th>
                <th style={{ ...thStyle, width: 60 }}>H (mm)</th>
                <th style={{ ...thStyle, width: 60 }}>D (mm)</th>
                <th style={{ ...thStyle, width: 120 }}>Material</th>
                <th style={{ ...thStyle, width: 120 }}>Door Style</th>
                <th style={{ ...thStyle, width: 45, textAlign: "center" }}>Drs</th>
                <th style={{ ...thStyle, width: 45, textAlign: "center" }}>Dwr</th>
                <th style={{ ...thStyle, width: 80, textAlign: "right" }}>Sell</th>
                {STATUS_COLS.map(s => (
                  <th key={s.key} style={{ ...thStyle, width: 50, textAlign: "center", color: STATUS_COLOR[s.key] }}>
                    {s.short}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Object.entries(groups).map(([groupLabel, cabs]) => {
                const collapsed = collapsedGroups[groupLabel];
                const groupSell = cabs.reduce((s, c) => s + Number(c.sell_price || 0), 0);
                const groupInstalled = cabs.filter(c => c.status === "installed").length;
                return [
                  // Group header row
                  <tr key={`g-${groupLabel}`}
                    onClick={() => setCollapsedGroups(g => ({ ...g, [groupLabel]: !g[groupLabel] }))}
                    style={{ cursor: "pointer", background: T.card2 }}>
                    <td colSpan={12} style={{ ...cellStyle, fontWeight: 800, fontSize: 12, color: T.accent, padding: "8px 14px" }}>
                      <span style={{ marginRight: 8, color: T.faint }}>{collapsed ? "▸" : "▾"}</span>
                      {groupLabel}
                      <span style={{ marginLeft: 12, fontWeight: 400, color: T.muted, fontSize: 11 }}>
                        {cabs.length} cabinets · ${Number(groupSell).toLocaleString("en-AU", { minimumFractionDigits: 0 })} · {groupInstalled}/{cabs.length} installed
                      </span>
                    </td>
                    {STATUS_COLS.map(s => {
                      const colDone = cabs.filter(c => statusReached(c.status, s.key)).length;
                      return (
                        <td key={s.key} style={{ ...cellStyle, textAlign: "center", background: T.card2 }}>
                          <span style={{ fontSize: 11, color: colDone === cabs.length ? STATUS_COLOR[s.key] : T.faint, fontFamily: "monospace", fontWeight: 700 }}>
                            {colDone}/{cabs.length}
                          </span>
                        </td>
                      );
                    })}
                  </tr>,
                  // Cabinet rows
                  ...(!collapsed ? cabs.map((cab, idx) => (
                    <tr key={cab.id}
                      style={{ background: idx % 2 === 0 ? T.card : T.card2 }}
                      onMouseEnter={e => e.currentTarget.style.background = T.accentDim}
                      onMouseLeave={e => e.currentTarget.style.background = idx % 2 === 0 ? T.card : T.card2}>
                      <td style={{ ...cellStyle, textAlign: "center", color: T.faint, fontSize: 11 }}>{idx + 1}</td>
                      <td style={{ ...cellStyle, fontFamily: "monospace", fontWeight: 700, color: T.accent }}>
                        <ConfDot score={cab.ai_confidence} />
                        {cab.cabinet_number || "—"}
                      </td>
                      <td style={{ ...cellStyle, fontWeight: 500, color: T.text, maxWidth: 200 }}>{cab.description || cab.cabinet_type}</td>
                      <td style={{ ...cellStyle, color: T.muted }}>{cab.cabinet_type}</td>
                      <td style={{ ...cellStyle, fontFamily: "monospace", textAlign: "right", color: T.text }}>{cab.width}</td>
                      <td style={{ ...cellStyle, fontFamily: "monospace", textAlign: "right", color: T.text }}>{cab.height}</td>
                      <td style={{ ...cellStyle, fontFamily: "monospace", textAlign: "right", color: T.text }}>{cab.depth}</td>
                      <td style={{ ...cellStyle, color: T.muted }}>{cab.material || "—"}</td>
                      <td style={{ ...cellStyle, color: T.muted }}>{cab.door_style || "—"}</td>
                      <td style={{ ...cellStyle, textAlign: "center", fontFamily: "monospace" }}>{cab.door_qty || 0}</td>
                      <td style={{ ...cellStyle, textAlign: "center", fontFamily: "monospace" }}>{cab.drawer_qty || 0}</td>
                      <td style={{ ...cellStyle, textAlign: "right", fontFamily: "monospace", fontWeight: 700, color: T.text }}>
                        {cab.sell_price ? `$${Number(cab.sell_price).toLocaleString("en-AU", { minimumFractionDigits: 0 })}` : "—"}
                      </td>
                      {STATUS_COLS.map(s => (
                        <StatusCell
                          key={s.key}
                          cabinetId={cab.id}
                          currentStatus={cab.status}
                          colStatus={s.key}
                          onChange={handleStatusChange}
                          T={T}
                        />
                      ))}
                    </tr>
                  )) : []),
                ];
              })}
            </tbody>
          </table>
        </div>
      )}

      <div style={{ marginTop: 12, fontSize: 11, color: T.faint }}>
        Click a status cell to advance a cabinet. Click again to undo. The Box Matrix updates live as cabinets change.
      </div>
    </div>
  );
}
