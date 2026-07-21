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
  const [groupBy,   setGroupBy]   = useState(proj?.breakdown_preference || "unit_type");
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

  function printBoxMatrix() {
    const e = v => String(v ?? "").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const fmtAud = v => `$${Number(v).toLocaleString("en-AU", { minimumFractionDigits: 0 })}`;
    const printed = new Date().toLocaleDateString("en-AU", { day: "2-digit", month: "short", year: "numeric" });

    const groupByFn = c => {
      if (groupBy === "unit_type")    return c.unit_type    || "Unassigned";
      if (groupBy === "joinery_type") return c.joinery_type || "Unassigned";
      if (groupBy === "building")     return c.building     || "Site";
      if (groupBy === "level")        return c.level        || "Level —";
      if (groupBy === "room")         return c.room         || "Unassigned";
      return "All";
    };
    const grouped = {};
    liveCabinets.forEach(c => {
      const g = groupByFn(c);
      if (!grouped[g]) grouped[g] = [];
      grouped[g].push(c);
    });

    const totalSellPrint = liveCabinets.reduce((s, c) => s + Number(c.sell_price || 0), 0);

    const statusCols = [
      { key: "cutting",    label: "CUT" },
      { key: "assembled",  label: "ASM" },
      { key: "qc",         label: "QC"  },
      { key: "dispatched", label: "DSP" },
      { key: "installed",  label: "INS" },
    ];
    const statusColors = { cutting:"#d97706", assembled:"#7c3aed", qc:"#2563eb", dispatched:"#0891b2", installed:"#16a34a" };
    const statusOrder  = ["pending","cutting","assembled","qc","dispatched","installed"];
    const reached = (cur, chk) => statusOrder.indexOf(cur) >= statusOrder.indexOf(chk);

    const headerCols = ["#","Cab #","Description","W","H","D","Matl","Door Style","Drs","Dwr","Sell","CUT","ASM","QC","DSP","INS"];
    const rows = Object.entries(grouped).map(([group, cabs]) => {
      const groupSell = cabs.reduce((s, c) => s + Number(c.sell_price || 0), 0);
      const cabRows = cabs.map((cab, idx) => {
        const statusCells = statusCols.map(s => {
          const ok = reached(cab.status, s.key);
          return `<td style="text-align:center;padding:5px 4px;border-bottom:1px solid #ddd;border-right:1px solid #ddd;background:${ok?`${statusColors[s.key]}22`:"transparent"}">
            <span style="display:inline-flex;align-items:center;justify-content:center;width:15px;height:15px;border-radius:2px;background:${ok?statusColors[s.key]:"transparent"};border:1.5px solid ${ok?statusColors[s.key]:"#ccc"};color:#fff;font-size:8px;font-weight:700">${ok?"✓":""}</span>
          </td>`;
        }).join("");
        return `<tr>
          <td style="text-align:center;color:#888;font-size:10px;padding:5px 4px;border-bottom:1px solid #ddd;border-right:1px solid #ddd">${idx+1}</td>
          <td style="font-family:monospace;font-weight:700;color:#1d4ed8;padding:5px 6px;border-bottom:1px solid #ddd;border-right:1px solid #ddd">${e(cab.cabinet_number||"—")}</td>
          <td style="padding:5px 6px;border-bottom:1px solid #ddd;border-right:1px solid #ddd">${e(cab.description||cab.cabinet_type||"—")}</td>
          <td style="font-family:monospace;text-align:right;padding:5px 4px;border-bottom:1px solid #ddd;border-right:1px solid #ddd">${cab.width||"—"}</td>
          <td style="font-family:monospace;text-align:right;padding:5px 4px;border-bottom:1px solid #ddd;border-right:1px solid #ddd">${cab.height||"—"}</td>
          <td style="font-family:monospace;text-align:right;padding:5px 4px;border-bottom:1px solid #ddd;border-right:1px solid #ddd">${cab.depth||"—"}</td>
          <td style="padding:5px 6px;border-bottom:1px solid #ddd;border-right:1px solid #ddd;font-size:10px">${e(cab.material||"—")}</td>
          <td style="padding:5px 6px;border-bottom:1px solid #ddd;border-right:1px solid #ddd;font-size:10px">${e(cab.door_style||"—")}</td>
          <td style="text-align:center;font-family:monospace;padding:5px 4px;border-bottom:1px solid #ddd;border-right:1px solid #ddd">${cab.door_qty||0}</td>
          <td style="text-align:center;font-family:monospace;padding:5px 4px;border-bottom:1px solid #ddd;border-right:1px solid #ddd">${cab.drawer_qty||0}</td>
          <td style="text-align:right;font-family:monospace;font-weight:700;padding:5px 6px;border-bottom:1px solid #ddd;border-right:1px solid #ddd">${cab.sell_price?fmtAud(cab.sell_price):"—"}</td>
          ${statusCells}
        </tr>`;
      }).join("");
      return `
        <tr style="background:#1e293b;color:#fff">
          <td colspan="5" style="padding:6px 10px;font-weight:700;font-size:11px">
            ${e(group)} — ${cabs.length} cabinet${cabs.length!==1?"s":""} · ${fmtAud(groupSell)}
          </td>
          <td colspan="11" style="padding:6px 10px;font-size:10px;color:#94a3b8">
            ${statusCols.map(s=>`${s.label}: ${cabs.filter(c=>reached(c.status,s.key)).length}/${cabs.length}`).join(" · ")}
          </td>
        </tr>
        ${cabRows}`;
    }).join("");

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
    <title>Box Matrix — ${e(proj?.name||"Project")}</title>
    <style>
      *{box-sizing:border-box;margin:0;padding:0}
      body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:11px;color:#0f172a;padding:20px}
      h1{font-size:16px;font-weight:800;margin-bottom:2px}
      .meta{font-size:10px;color:#64748b;margin-bottom:16px}
      table{width:100%;border-collapse:collapse}
      th{background:#1e293b;color:#fff;padding:6px 8px;text-align:left;font-size:9px;font-weight:700;letter-spacing:0.05em;text-transform:uppercase;border-right:1px solid #334155;white-space:nowrap}
      .footer{margin-top:16px;padding-top:10px;border-top:2px solid #1e293b;display:flex;justify-content:space-between;font-size:10px}
      .footer strong{font-size:13px}
      @media print{body{padding:8px}@page{size:A3 landscape;margin:10mm}}
    </style>
    </head><body>
    <h1>Box Matrix — ${e(proj?.name||"Project")}</h1>
    <div class="meta">Printed ${printed} · ${liveCabinets.length} cabinet${liveCabinets.length!==1?"s":""} · Grouped by ${groupBy.replace("_"," ")} · ${fmtAud(totalSellPrint)} total sell</div>
    <table>
      <thead><tr>
        ${headerCols.map(h=>`<th>${h}</th>`).join("")}
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <div class="footer">
      <span>Total: <strong>${fmtAud(totalSellPrint)}</strong></span>
      <span>Installed: <strong>${liveCabinets.filter(c=>c.status==="installed").length} / ${liveCabinets.length}</strong></span>
      <span>${liveCabinets.length} cabinet${liveCabinets.length!==1?"s":""}</span>
    </div>
    <script>window.onload=()=>window.print();</script>
    </body></html>`;

    const w = window.open("", "_blank");
    if (w) { w.document.write(html); w.document.close(); }
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

        {liveCabinets.length > 0 && (
          <button onClick={printBoxMatrix}
            style={{ background: "transparent", color: T.muted, border: `1px solid ${T.border}`, borderRadius: 5, padding: "6px 12px", fontSize: 12, cursor: "pointer", whiteSpace: "nowrap" }}>
            ⎙ Print
          </button>
        )}
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
