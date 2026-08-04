import { supabase } from "../supabase";
import { getIdentity, errMsg, logActivity, DbResult } from "./_base";

// ─────────────────────────────────────────────────────────────────────────────
// Estimates data access. One working estimate per project (V1). Quote
// versioning/locking arrives in a later phase; this is the editable draft.
// ─────────────────────────────────────────────────────────────────────────────

export type EstimateItem = {
  id: string;
  company_id: string;
  estimate_id: string;
  category?: string | null;
  description: string;
  qty: number;
  unit?: string | null;
  rate: number;
  margin_pct?: number | null;
  source?: string;
  cab?: any | null;
  finish_id?: number | null;
  sort_order: number;
};

export type Estimate = {
  id: string;
  company_id: string;
  project_id: string;
  margin_pct: number;
  overhead_pct: number;
  notes?: string | null;
};

/** Get (or lazily create) the estimate for a project, with its items. */
export async function getEstimate(
  projectId: string
): Promise<DbResult<{ estimate: Estimate; items: EstimateItem[] }>> {
  try {
    const { userId, companyId } = await getIdentity();
    if (!companyId) return { data: null, error: "No company for current user." };

    let { data: est, error } = await supabase
      .from("estimates")
      .select("*")
      .eq("project_id", projectId)
      .maybeSingle();
    if (error) return { data: null, error: errMsg(error) };

    if (!est) {
      const { data: created, error: cErr } = await supabase
        .from("estimates")
        .insert({ company_id: companyId, project_id: projectId, created_by: userId, updated_by: userId })
        .select()
        .single();
      if (cErr) return { data: null, error: errMsg(cErr) };
      est = created;
    }

    const { data: items, error: iErr } = await supabase
      .from("estimate_items")
      .select("*")
      .eq("estimate_id", est.id)
      .order("sort_order", { ascending: true });
    if (iErr) return { data: null, error: errMsg(iErr) };

    return { data: { estimate: est, items: items || [] }, error: null };
  } catch (e) {
    return { data: null, error: errMsg(e) };
  }
}

export async function updateEstimate(
  id: string,
  patch: Partial<Estimate>
): Promise<DbResult<Estimate>> {
  try {
    const { userId } = await getIdentity();
    const clean: any = { ...patch, updated_by: userId, updated_at: new Date().toISOString() };
    delete clean.id;
    delete clean.company_id;
    delete clean.project_id;
    const { data, error } = await supabase.from("estimates").update(clean).eq("id", id).select().single();
    if (error) return { data: null, error: errMsg(error) };
    await logActivity("estimate", id, "update", `Updated estimate settings`);
    return { data, error: null };
  } catch (e) {
    return { data: null, error: errMsg(e) };
  }
}

export async function addItem(
  estimateId: string,
  item: Partial<EstimateItem>
): Promise<DbResult<EstimateItem>> {
  try {
    const { companyId } = await getIdentity();
    if (!companyId) return { data: null, error: "No company for current user." };
    const row = {
      company_id: companyId,
      estimate_id: estimateId,
      category: item.category ?? null,
      description: item.description || "",
      qty: item.qty ?? 0,
      unit: item.unit ?? null,
      rate: item.rate ?? 0,
      margin_pct: item.margin_pct ?? null,
      source: item.source ?? "manual",
      cab: item.cab ?? null,
      sort_order: item.sort_order ?? 0,
    };
    const { data, error } = await supabase.from("estimate_items").insert(row).select().single();
    if (error) return { data: null, error: errMsg(error) };
    return { data, error: null };
  } catch (e) {
    return { data: null, error: errMsg(e) };
  }
}

/** Bulk insert (used by push-from-takeoff). Returns inserted rows. */
export async function addItems(
  estimateId: string,
  items: Partial<EstimateItem>[]
): Promise<DbResult<EstimateItem[]>> {
  try {
    const { companyId } = await getIdentity();
    if (!companyId) return { data: null, error: "No company for current user." };
    const rows = items.map((item, i) => ({
      company_id: companyId,
      estimate_id: estimateId,
      category: item.category ?? null,
      description: item.description || "",
      qty: item.qty ?? 0,
      unit: item.unit ?? null,
      rate: item.rate ?? 0,
      margin_pct: item.margin_pct ?? null,
      source: item.source ?? "takeoff",
      cab: item.cab ?? null,
      sort_order: item.sort_order ?? i,
    }));
    const { data, error } = await supabase.from("estimate_items").insert(rows).select();
    if (error) return { data: null, error: errMsg(error) };
    await logActivity("estimate", estimateId, "update", `Added ${rows.length} items`);
    return { data: data || [], error: null };
  } catch (e) {
    return { data: null, error: errMsg(e) };
  }
}

export async function updateItem(
  id: string,
  patch: Partial<EstimateItem>
): Promise<DbResult<EstimateItem>> {
  try {
    const clean: any = { ...patch, updated_at: new Date().toISOString() };
    delete clean.id;
    delete clean.company_id;
    delete clean.estimate_id;
    const { data, error } = await supabase.from("estimate_items").update(clean).eq("id", id).select().single();
    if (error) return { data: null, error: errMsg(error) };
    const changedFields = Object.keys(patch).filter(k => !["id","company_id","estimate_id"].includes(k));
    await logActivity("estimate_item", id, "update",
      `Updated estimate line: ${data?.description || id}`,
      { fields: changedFields }, data?.description ?? undefined);
    return { data, error: null };
  } catch (e) {
    return { data: null, error: errMsg(e) };
  }
}

export async function deleteItem(id: string): Promise<DbResult<true>> {
  try {
    const { error } = await supabase.from("estimate_items").delete().eq("id", id);
    if (error) return { data: null, error: errMsg(error) };
    await logActivity("estimate_item", id, "delete", "Deleted estimate line");
    return { data: true, error: null };
  } catch (e) {
    return { data: null, error: errMsg(e) };
  }
}
