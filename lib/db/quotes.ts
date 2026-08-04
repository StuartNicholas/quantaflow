import { supabase } from "../supabase";
import { getIdentity, errMsg, logActivity, DbResult } from "./_base";

// ─────────────────────────────────────────────────────────────────────────────
// Quote versioning. Each issued quote is a locked snapshot of the working
// estimate at the moment of issue. Issued versions are never mutated; status
// transitions (draft→sent→accepted/declined) are the only allowed writes.
// ─────────────────────────────────────────────────────────────────────────────

export type QuoteVersion = {
  id: string;
  company_id: string;
  project_id: string;
  version_number: number;
  status: "draft" | "sent" | "accepted" | "declined" | "superseded";
  margin_pct?: number | null;
  overhead_pct?: number | null;
  gst_pct?: number | null;
  deposit_pct?: number | null;
  total_ex_gst?: number | null;
  total_inc_gst?: number | null;
  notes?: string | null;
  issued_at?: string | null;
  accepted_at?: string | null;
  issued_by?: string | null;
  created_by?: string | null;
  updated_by?: string | null;
  created_at?: string;
  updated_at?: string;
};

export type QuoteVersionItem = {
  id: string;
  company_id: string;
  quote_version_id: string;
  category?: string | null;
  description: string;
  qty: number;
  unit?: string | null;
  rate: number;
  margin_pct?: number | null;
  sort_order: number;
};

export async function listQuoteVersions(
  projectId: string
): Promise<DbResult<QuoteVersion[]>> {
  try {
    const { data, error } = await supabase
      .from("quote_versions")
      .select("*")
      .eq("project_id", projectId)
      .order("version_number", { ascending: false });
    if (error) return { data: null, error: errMsg(error) };
    return { data: data || [], error: null };
  } catch (e) {
    return { data: null, error: errMsg(e) };
  }
}

export async function getQuoteVersionItems(
  quoteVersionId: string
): Promise<DbResult<QuoteVersionItem[]>> {
  try {
    const { data, error } = await supabase
      .from("quote_version_items")
      .select("*")
      .eq("quote_version_id", quoteVersionId)
      .order("sort_order", { ascending: true });
    if (error) return { data: null, error: errMsg(error) };
    return { data: data || [], error: null };
  } catch (e) {
    return { data: null, error: errMsg(e) };
  }
}

export type QuoteExtras = {
  pm: number;
  delivery: number;
  protection: number;
  siteSetup: number; // pre-calculated: installSiteSetupHours × installHourlyRate
};

export async function issueQuote(
  projectId: string,
  opts: {
    gst_pct?: number;
    deposit_pct?: number;
    notes?: string;
    extras?: QuoteExtras;
    show_extras_breakdown?: boolean; // true = individual lines, false = one "Project Costs" line
  }
): Promise<DbResult<QuoteVersion>> {
  try {
    const { userId, companyId } = await getIdentity();
    if (!companyId) return { data: null, error: "No company for current user." };

    // Load the working estimate
    const { data: est, error: estErr } = await supabase
      .from("estimates")
      .select("*")
      .eq("project_id", projectId)
      .maybeSingle();
    if (estErr) return { data: null, error: errMsg(estErr) };
    if (!est) return { data: null, error: "No estimate found. Add items in the Estimate tab first." };

    const { data: estItems, error: itemsErr } = await supabase
      .from("estimate_items")
      .select("*")
      .eq("estimate_id", est.id)
      .order("sort_order", { ascending: true });
    if (itemsErr) return { data: null, error: errMsg(itemsErr) };
    if (!estItems || estItems.length === 0)
      return { data: null, error: "No items in the estimate. Add items before issuing a quote." };

    // Load approved variations
    const { data: variations } = await supabase
      .from("variations")
      .select("id, ref, description, amount, status")
      .eq("project_id", projectId)
      .eq("status", "approved");
    const approvedVars = variations || [];
    const varTotal = approvedVars.reduce((s, v) => s + (v.amount || 0), 0);

    // Compute totals — must match calc() in ConstructionHub exactly
    const marginPct = est.margin_pct ?? 0;
    const overheadPct = est.overhead_pct ?? 0;
    const gstPct = opts.gst_pct ?? 10;
    const sub = estItems.reduce((s, item) => {
      const m = item.margin_pct ?? marginPct;
      return s + (item.qty || 0) * (item.rate || 0) * (1 + m / 100);
    }, 0);
    const ovhd = sub * (overheadPct / 100);

    const ex = opts.extras;
    const totalExtras = ex ? (ex.pm || 0) + (ex.delivery || 0) + (ex.protection || 0) + (ex.siteSetup || 0) : 0;

    const exGst = sub + ovhd + varTotal + totalExtras;
    const gstAmt = exGst * (gstPct / 100);
    const totalIncGst = exGst + gstAmt;

    // Next version number
    const { data: latest } = await supabase
      .from("quote_versions")
      .select("version_number")
      .eq("project_id", projectId)
      .order("version_number", { ascending: false })
      .limit(1);
    const nextVersion = latest && latest.length > 0 ? latest[0].version_number + 1 : 1;

    // Supersede any active (draft/sent) versions
    await supabase
      .from("quote_versions")
      .update({ status: "superseded", updated_by: userId, updated_at: new Date().toISOString() })
      .eq("project_id", projectId)
      .in("status", ["draft", "sent"]);

    // Create the locked snapshot version
    const { data: version, error: vErr } = await supabase
      .from("quote_versions")
      .insert({
        company_id: companyId,
        project_id: projectId,
        version_number: nextVersion,
        status: "draft",
        margin_pct: marginPct,
        overhead_pct: overheadPct,
        gst_pct: gstPct,
        deposit_pct: opts.deposit_pct ?? 0,
        total_ex_gst: parseFloat(exGst.toFixed(2)),
        total_inc_gst: parseFloat(totalIncGst.toFixed(2)),
        notes: opts.notes ?? null,
        issued_at: new Date().toISOString(),
        issued_by: userId,
        created_by: userId,
        updated_by: userId,
      })
      .select()
      .single();
    if (vErr) return { data: null, error: errMsg(vErr) };

    // Snapshot line items — estimate rows first, then extras + variations appended
    const itemRows: any[] = estItems.map((item, i) => ({
      company_id: companyId,
      quote_version_id: version.id,
      category: item.category ?? null,
      description: item.description || "",
      qty: item.qty ?? 0,
      unit: item.unit ?? null,
      rate: item.rate ?? 0,
      margin_pct: item.margin_pct ?? null,
      sort_order: item.sort_order ?? i,
    }));

    const baseSort = itemRows.length;

    // Approved variations — each as its own line (always shown when non-zero)
    approvedVars.forEach((v, i) => {
      if ((v.amount || 0) === 0) return;
      itemRows.push({
        company_id: companyId,
        quote_version_id: version.id,
        category: "Approved Variations",
        description: v.ref ? `${v.ref}: ${v.description || "Variation"}` : (v.description || "Variation"),
        qty: 1,
        unit: "set",
        rate: v.amount || 0,
        margin_pct: 0,
        sort_order: baseSort + i,
      });
    });

    // Cabinet extras — breakdown or single consolidated line
    const ex2 = opts.extras;
    if (ex2 && totalExtras > 0) {
      if (opts.show_extras_breakdown) {
        const extraLines = [
          ex2.pm > 0        && { desc: "Project Management Allowance", rate: ex2.pm },
          ex2.delivery > 0  && { desc: "Delivery & Handling", rate: ex2.delivery },
          ex2.protection > 0&& { desc: "Site Protection", rate: ex2.protection },
          ex2.siteSetup > 0 && { desc: "Installation Site Setup", rate: ex2.siteSetup },
        ].filter(Boolean) as { desc: string; rate: number }[];
        extraLines.forEach((el, i) => {
          itemRows.push({
            company_id: companyId,
            quote_version_id: version.id,
            category: "Project Costs",
            description: el.desc,
            qty: 1,
            unit: "set",
            rate: el.rate,
            margin_pct: 0,
            sort_order: baseSort + approvedVars.length + i,
          });
        });
      } else {
        itemRows.push({
          company_id: companyId,
          quote_version_id: version.id,
          category: "Project Costs",
          description: "Project Costs (PM allowance, delivery, site protection & setup)",
          qty: 1,
          unit: "set",
          rate: totalExtras,
          margin_pct: 0,
          sort_order: baseSort + approvedVars.length,
        });
      }
    }

    const { error: snapErr } = await supabase.from("quote_version_items").insert(itemRows);
    if (snapErr) return { data: null, error: errMsg(snapErr) };

    await logActivity("quote_version", version.id, "create", `Issued quote v${nextVersion}`);
    return { data: version, error: null };
  } catch (e) {
    return { data: null, error: errMsg(e) };
  }
}

export async function updateQuoteStatus(
  id: string,
  status: "sent" | "accepted" | "declined"
): Promise<DbResult<QuoteVersion>> {
  try {
    const { userId } = await getIdentity();
    const patch: any = { status, updated_by: userId, updated_at: new Date().toISOString() };
    if (status === "accepted") patch.accepted_at = new Date().toISOString();
    const { data, error } = await supabase
      .from("quote_versions")
      .update(patch)
      .eq("id", id)
      .select()
      .single();
    if (error) return { data: null, error: errMsg(error) };
    await logActivity("quote_version", id, "update", `Quote v${data.version_number} → ${status}`);
    return { data, error: null };
  } catch (e) {
    return { data: null, error: errMsg(e) };
  }
}
