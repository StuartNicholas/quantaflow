"use client";
// ─────────────────────────────────────────────────────────────────────────────
// QuotePDF — @react-pdf/renderer document + download button.
// Imported with dynamic() in ConstructionHub to avoid SSR issues.
// ─────────────────────────────────────────────────────────────────────────────
import { Document, Page, View, Text, StyleSheet, PDFDownloadLink } from "@react-pdf/renderer";

const AMBER = "#b45309";
const GREY  = "#6b7280";

const s = StyleSheet.create({
  page:        { fontFamily: "Helvetica", fontSize: 10, color: "#111827", paddingTop: 44, paddingBottom: 52, paddingLeft: 50, paddingRight: 50 },
  row:         { flexDirection: "row" },
  header:      { flexDirection: "row", justifyContent: "space-between", marginBottom: 18 },
  coName:      { fontFamily: "Helvetica-Bold", fontSize: 18, marginBottom: 4 },
  coDetail:    { fontSize: 9, color: GREY, lineHeight: 1.7 },
  quoteLabel:  { fontFamily: "Helvetica-Bold", fontSize: 30, color: AMBER, textAlign: "right", letterSpacing: 2 },
  refBlock:    { fontSize: 9, color: GREY, lineHeight: 1.8, textAlign: "right", marginTop: 5 },
  refVal:      { fontFamily: "Helvetica-Bold", color: "#374151" },
  rule:        { borderBottom: "2 solid #b45309", marginBottom: 18 },
  clientLabel: { fontFamily: "Helvetica-Bold", fontSize: 8, color: "#9ca3af", textTransform: "uppercase", letterSpacing: 1.2, marginBottom: 4 },
  clientName:  { fontFamily: "Helvetica-Bold", fontSize: 13, marginBottom: 2 },
  clientAddr:  { fontSize: 9, color: GREY },
  projBox:     { backgroundColor: "#faf7f2", borderRadius: 4, padding: "10 14", marginTop: 14, marginBottom: 18 },
  projName:    { fontFamily: "Helvetica-Bold", fontSize: 11, marginBottom: 3 },
  projNote:    { fontSize: 9, color: GREY },
  tHead:       { flexDirection: "row", borderBottom: "1 solid #d1d5db", paddingBottom: 5, marginBottom: 2 },
  tHeadCell:   { fontSize: 8, fontFamily: "Helvetica-Bold", color: "#9ca3af", textTransform: "uppercase", letterSpacing: 0.8 },
  catHdr:      { fontFamily: "Helvetica-Bold", fontSize: 9, color: AMBER, marginTop: 12, marginBottom: 4, paddingBottom: 3, borderBottom: "0.5 solid #f3d0a0" },
  tRow:        { flexDirection: "row", borderBottom: "0.5 solid #f3f4f6", paddingTop: 5, paddingBottom: 5 },
  desc:        { flex: 4, fontSize: 9, color: "#374151" },
  qty:         { width: 36, fontSize: 9, color: "#374151", textAlign: "right" },
  unit:        { width: 40, fontSize: 9, color: GREY, textAlign: "right" },
  amt:         { width: 70, fontSize: 9, color: "#374151", textAlign: "right" },
  catTotal:    { flexDirection: "row", paddingTop: 4, paddingBottom: 4, marginBottom: 4 },
  catTotLabel: { flex: 4, fontSize: 8, color: GREY, textAlign: "right", paddingRight: 8 },
  catTotAmt:   { width: 70, fontSize: 9, fontFamily: "Helvetica-Bold", color: "#374151", textAlign: "right" },
  totalsBox:   { marginTop: 20, borderTop: "2 solid #e5e7eb", paddingTop: 14 },
  totRow:      { flexDirection: "row", justifyContent: "flex-end", marginBottom: 4 },
  totLabel:    { width: 130, fontSize: 9, color: GREY, textAlign: "right", paddingRight: 14 },
  totVal:      { width: 90, fontSize: 9, color: "#374151", textAlign: "right" },
  grandRow:    { flexDirection: "row", justifyContent: "flex-end", marginTop: 8, paddingTop: 8, borderTop: "1 solid #d1d5db" },
  grandLabel:  { width: 130, fontSize: 12, fontFamily: "Helvetica-Bold", textAlign: "right", paddingRight: 14 },
  grandVal:    { width: 90, fontSize: 12, fontFamily: "Helvetica-Bold", textAlign: "right" },
  depRow:      { flexDirection: "row", justifyContent: "flex-end", marginTop: 6 },
  depLabel:    { width: 130, fontSize: 9, color: "#7c3aed", textAlign: "right", paddingRight: 14 },
  depVal:      { width: 90, fontSize: 9, color: "#7c3aed", fontFamily: "Helvetica-Bold", textAlign: "right" },
  varRow:      { flexDirection: "row", paddingTop: 3, paddingBottom: 3 },
  varDesc:     { flex: 4, fontSize: 9, color: "#374151", paddingLeft: 8 },
  varAmt:      { width: 70, fontSize: 9, color: "#374151", textAlign: "right" },
  footer:      { position: "absolute", bottom: 30, left: 50, right: 50 },
  footerRule:  { borderTop: "0.5 solid #e5e7eb", marginBottom: 8 },
  footerText:  { fontSize: 8, color: "#9ca3af", lineHeight: 1.6 },
  pageNum:     { fontSize: 8, color: "#9ca3af", textAlign: "right" },
});

const JOINERY_CATS = [
  "Kitchens","Laundry","Robes & WIR","Linen & Storage","Vanity Units",
  "Island Units","Benchtops","Splashbacks","Panels & Fillers",
  "Base Cabinets","Wall Cabinets","Tall Cabinets","Other",
];

function joineryCategory(li) {
  const d = (li.description || li.item_type || "").toLowerCase();
  if (/kitchen|kitch|base cab|wall cab|overhead/i.test(d)) return "Kitchens";
  if (/laundry|washer|dryer/i.test(d))                     return "Laundry";
  if (/robe|wr|walk.in|wardrobe/i.test(d))                 return "Robes & WIR";
  if (/linen|store|storage/i.test(d))                      return "Linen & Storage";
  if (/vanity|bath|ensuite/i.test(d))                      return "Vanity Units";
  if (/island|peninsula/i.test(d))                         return "Island Units";
  if (/benchtop|bench top|stone|laminate bench/i.test(d))  return "Benchtops";
  if (/splash|tile/i.test(d))                              return "Splashbacks";
  if (/panel|filler|end panel/i.test(d))                   return "Panels & Fillers";
  return "Other";
}

function $$(n) {
  return new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits: 0 }).format(n || 0);
}

function lineAmt(li, marginPct) {
  return (li.qty || 0) * (li.rate || 0) * (1 + ((li.margin_pct ?? marginPct ?? 0) / 100));
}

// ── The actual PDF document ──────────────────────────────────────────────────

function QuotePDFDoc({ items, proj, company, marginPct, overheadPct, gstPct, depositPct, versionNum, issuedAt, variations }) {
  const approvedVars = (variations || []).filter(v => v.status === "approved");
  const varTotal     = approvedVars.reduce((s, v) => s + (v.amount || 0), 0);
  const sub          = (items || []).reduce((s, li) => s + lineAmt(li, marginPct), 0);
  const ovhd         = sub * (overheadPct || 0) / 100;
  const exGst        = sub + ovhd + varTotal;
  const gstAmt       = exGst * (gstPct || 10) / 100;
  const total        = exGst + gstAmt;
  const depositAmt   = total * (depositPct || 0) / 100;

  const ref = versionNum
    ? `Q${String(versionNum).padStart(3, "0")}-${(proj.id || "").slice(0, 6).toUpperCase()}`
    : `DRAFT-${(proj.id || "").slice(0, 6).toUpperCase()}`;

  const fmt = d => d
    ? new Date(d).toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric" })
    : new Date().toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric" });

  const validDays  = parseInt((company?.quoteValidity || "").match(/(\d+)\s*day/i)?.[1]) || 30;
  const dateStr    = fmt(issuedAt);
  const expiryStr  = issuedAt
    ? fmt(new Date(new Date(issuedAt).getTime() + validDays * 86400000))
    : fmt(new Date(Date.now() + validDays * 86400000));

  // Group items by joinery category
  const groups = {};
  for (const li of (items || [])) {
    const cat = joineryCategory(li);
    if (!groups[cat]) groups[cat] = [];
    groups[cat].push(li);
  }
  const orderedCats = JOINERY_CATS.filter(c => groups[c]).concat(Object.keys(groups).filter(c => !JOINERY_CATS.includes(c)));

  return (
    <Document>
      <Page size="A4" style={s.page}>

        {/* ── Company header ── */}
        <View style={s.header}>
          <View style={{ flex: 1 }}>
            <Text style={s.coName}>{company?.name || "Your Company"}</Text>
            <Text style={s.coDetail}>
              {[company?.address, company?.phone, company?.email, company?.website].filter(Boolean).join(" · ")}
              {company?.abn ? `\nABN: ${company.abn}` : ""}
            </Text>
          </View>
          <View style={{ width: 160, alignItems: "flex-end" }}>
            <Text style={s.quoteLabel}>QUOTE</Text>
            <View style={s.refBlock}>
              <Text>Ref: <Text style={s.refVal}>{ref}</Text></Text>
              <Text>Date: <Text style={s.refVal}>{dateStr}</Text></Text>
              <Text>Valid until: <Text style={s.refVal}>{expiryStr}</Text></Text>
            </View>
          </View>
        </View>

        <View style={s.rule} />

        {/* ── Client + project ── */}
        <View style={s.row}>
          <View style={{ flex: 1 }}>
            <Text style={s.clientLabel}>Prepared For</Text>
            <Text style={s.clientName}>{proj.client || "Client"}</Text>
            {proj.address ? <Text style={s.clientAddr}>{proj.address}</Text> : null}
          </View>
          {(proj.tender_number || proj.project_number) ? (
            <View style={{ width: 180, alignItems: "flex-end" }}>
              {proj.tender_number  && <Text style={s.clientAddr}>Tender No: {proj.tender_number}</Text>}
              {proj.project_number && <Text style={s.clientAddr}>Project No: {proj.project_number}</Text>}
              {proj.revision       && <Text style={s.clientAddr}>Revision: {proj.revision}</Text>}
            </View>
          ) : null}
        </View>

        <View style={s.projBox}>
          <Text style={s.projName}>{proj.name}</Text>
          {(proj.description || proj.notes) ? <Text style={s.projNote}>{proj.description || proj.notes}</Text> : null}
        </View>

        {/* ── Line items ── */}
        <View style={s.tHead}>
          <Text style={[s.tHeadCell, { flex: 4 }]}>Description</Text>
          <Text style={[s.tHeadCell, { width: 36, textAlign: "right" }]}>Qty</Text>
          <Text style={[s.tHeadCell, { width: 40, textAlign: "right" }]}>Unit</Text>
          <Text style={[s.tHeadCell, { width: 70, textAlign: "right" }]}>Amount</Text>
        </View>

        {orderedCats.map(cat => {
          const rows = groups[cat];
          const catTotal = rows.reduce((sum, li) => sum + lineAmt(li, marginPct), 0);
          return (
            <View key={cat} wrap={false}>
              <Text style={s.catHdr}>{cat}</Text>
              {rows.map((li, i) => (
                <View key={i} style={s.tRow}>
                  <Text style={s.desc}>{li.description || li.item || "—"}</Text>
                  <Text style={s.qty}>{li.qty || 1}</Text>
                  <Text style={s.unit}>{li.unit || "ea"}</Text>
                  <Text style={s.amt}>{$$(lineAmt(li, marginPct))}</Text>
                </View>
              ))}
              <View style={s.catTotal}>
                <Text style={s.catTotLabel}>{cat} subtotal</Text>
                <Text style={s.catTotAmt}>{$$(catTotal)}</Text>
              </View>
            </View>
          );
        })}

        {/* ── Approved variations ── */}
        {approvedVars.length > 0 && (
          <View wrap={false}>
            <Text style={[s.catHdr, { marginTop: 16 }]}>Approved Variations</Text>
            {approvedVars.map((v, i) => (
              <View key={i} style={s.varRow}>
                <Text style={s.varDesc}>{v.description || `Variation ${i + 1}`}</Text>
                <Text style={s.varAmt}>{$$(v.amount || 0)}</Text>
              </View>
            ))}
          </View>
        )}

        {/* ── Totals ── */}
        <View style={s.totalsBox} wrap={false}>
          <View style={s.totRow}>
            <Text style={s.totLabel}>Subtotal (ex. overhead & GST)</Text>
            <Text style={s.totVal}>{$$(sub)}</Text>
          </View>
          {(overheadPct || 0) > 0 && (
            <View style={s.totRow}>
              <Text style={s.totLabel}>Overhead ({overheadPct}%)</Text>
              <Text style={s.totVal}>{$$(ovhd)}</Text>
            </View>
          )}
          {approvedVars.length > 0 && (
            <View style={s.totRow}>
              <Text style={s.totLabel}>Approved Variations</Text>
              <Text style={s.totVal}>{$$(varTotal)}</Text>
            </View>
          )}
          <View style={s.totRow}>
            <Text style={s.totLabel}>Subtotal (ex. GST)</Text>
            <Text style={s.totVal}>{$$(exGst)}</Text>
          </View>
          <View style={s.totRow}>
            <Text style={s.totLabel}>GST ({gstPct || 10}%)</Text>
            <Text style={s.totVal}>{$$(gstAmt)}</Text>
          </View>
          <View style={s.grandRow}>
            <Text style={s.grandLabel}>Total (inc. GST)</Text>
            <Text style={s.grandVal}>{$$(total)}</Text>
          </View>
          {(depositPct || 0) > 0 && (
            <View style={s.depRow}>
              <Text style={s.depLabel}>Deposit Required ({depositPct}%)</Text>
              <Text style={s.depVal}>{$$(depositAmt)}</Text>
            </View>
          )}
        </View>

        {/* ── Footer ── */}
        <View style={s.footer} fixed>
          <View style={s.footerRule} />
          <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
            <Text style={s.footerText}>
              {company?.paymentTerms || "Payment due within 14 days of invoice date."}{"\n"}
              This quote is valid until {expiryStr}.
            </Text>
            <Text style={s.pageNum} render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} fixed />
          </View>
        </View>

      </Page>
    </Document>
  );
}

// ── Download button — exported for use in ConstructionHub ───────────────────

export function QuotePDFButton({ items, proj, company, marginPct, overheadPct, gstPct, depositPct, versionNum, issuedAt, variations, disabled, style }) {
  const filename = versionNum
    ? `Quote-${proj?.name?.replace(/[^a-z0-9]/gi, "_")}-v${versionNum}.pdf`
    : `Quote-${proj?.name?.replace(/[^a-z0-9]/gi, "_")}-DRAFT.pdf`;

  if (!items || items.length === 0) {
    return (
      <button disabled style={{ opacity: 0.4, cursor: "not-allowed", ...btnStyle, ...style }}>
        ⬇ Download PDF
      </button>
    );
  }

  return (
    <PDFDownloadLink
      document={
        <QuotePDFDoc
          items={items} proj={proj} company={company}
          marginPct={marginPct} overheadPct={overheadPct}
          gstPct={gstPct} depositPct={depositPct}
          versionNum={versionNum} issuedAt={issuedAt}
          variations={variations}
        />
      }
      fileName={filename}
      style={{ textDecoration: "none" }}
    >
      {({ loading }) => (
        <button disabled={loading || disabled} style={{ opacity: (loading || disabled) ? 0.6 : 1, ...btnStyle, ...style }}>
          {loading ? "Building PDF…" : "⬇ Download PDF"}
        </button>
      )}
    </PDFDownloadLink>
  );
}

const btnStyle = {
  background: "transparent",
  color: "#94a3b8",
  border: "1px solid #334155",
  borderRadius: 6,
  padding: "4px 10px",
  fontSize: 12,
  fontWeight: 600,
  cursor: "pointer",
  display: "inline-flex",
  alignItems: "center",
  gap: 5,
};
