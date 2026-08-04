import { supabase } from "../supabase";
import { getIdentity, errMsg, logActivity, DbResult } from "./_base";

// ─────────────────────────────────────────────────────────────────────────────
// Takeoff persistence. One takeoff record per project (replace-on-rerun).
// Items are individual rows for efficient add/delete without rewriting the
// whole takeoff. ai_summary and layers stored as JSONB blobs.
// ─────────────────────────────────────────────────────────────────────────────

export type TakeoffItem = {
  id: string;
  company_id: string;
  takeoff_id: string;
  layer_id?: string | null;
  type: string;
  label: string;
  qty: number;
  unit?: string | null;
  source?: string | null;
  cab?: any | null;
  notes?: string | null;
  sort_order: number;
};

export type Takeoff = {
  id: string;
  company_id: string;
  project_id: string;
  pdf_name?: string | null;
  ai_summary?: any | null;
  layers?: any | null;
  version_number?: number;
  superseded_at?: string | null;
  created_at?: string;
  updated_at?: string;
};

export async function getTakeoff(
  projectId: string
): Promise<DbResult<{ takeoff: Takeoff; items: TakeoffItem[] } | null>> {
  try {
    const { data: takeoff, error } = await supabase
      .from("takeoffs")
      .select("*")
      .eq("project_id", projectId)
      .is("superseded_at", null)
      .maybeSingle();
    if (error) return { data: null, error: errMsg(error) };
    if (!takeoff) return { data: null, error: null };

    const { data: items, error: iErr } = await supabase
      .from("takeoff_items")
      .select("*")
      .eq("takeoff_id", takeoff.id)
      .order("sort_order", { ascending: true });
    if (iErr) return { data: null, error: errMsg(iErr) };

    return { data: { takeoff, items: items || [] }, error: null };
  } catch (e) {
    return { data: null, error: errMsg(e) };
  }
}

/** Archive the current takeoff (sets superseded_at) and insert a new version. */
export async function saveTakeoff(
  projectId: string,
  data: { pdfName?: string; aiSummary?: any; layers?: any[]; items: any[] }
): Promise<DbResult<Takeoff>> {
  try {
    const { userId, companyId } = await getIdentity();
    if (!companyId) return { data: null, error: "No company for current user." };

    // Determine next version number before archiving
    const { data: latest } = await supabase
      .from("takeoffs")
      .select("version_number")
      .eq("project_id", projectId)
      .is("superseded_at", null)
      .maybeSingle();
    const nextVersion = latest ? (latest.version_number || 1) + 1 : 1;

    // Archive the current active record instead of deleting it
    await supabase
      .from("takeoffs")
      .update({ superseded_at: new Date().toISOString(), updated_by: userId })
      .eq("project_id", projectId)
      .is("superseded_at", null);

    const { data: takeoff, error: tErr } = await supabase
      .from("takeoffs")
      .insert({
        company_id: companyId,
        project_id: projectId,
        version_number: nextVersion,
        pdf_name: data.pdfName ?? null,
        ai_summary: data.aiSummary ?? null,
        layers: data.layers ?? null,
        created_by: userId,
        updated_by: userId,
      })
      .select()
      .single();
    if (tErr) return { data: null, error: errMsg(tErr) };

    if (data.items.length > 0) {
      const rows = data.items.map((item, i) => ({
        company_id: companyId,
        takeoff_id: takeoff.id,
        layer_id: item.layerId ?? null,
        type: item.type || "count",
        label: item.label || "",
        qty: item.qty ?? 0,
        unit: item.unit ?? null,
        source: item.source ?? "ai",
        cab: item.cab ?? null,
        notes: item.notes ?? null,
        sort_order: i,
      }));
      const { error: iErr } = await supabase.from("takeoff_items").insert(rows);
      if (iErr) return { data: null, error: errMsg(iErr) };
    }

    await logActivity("takeoff", takeoff.id, "create",
      `Takeoff v${nextVersion} saved — ${data.items.length} item${data.items.length !== 1 ? "s" : ""}`,
      { pdf_name: data.pdfName, version: nextVersion, item_count: data.items.length },
      data.pdfName ?? undefined, projectId);
    return { data: takeoff, error: null };
  } catch (e) {
    return { data: null, error: errMsg(e) };
  }
}

/** Get or create a blank takeoff record — needed before adding manual items. */
export async function ensureTakeoff(projectId: string): Promise<DbResult<Takeoff>> {
  try {
    const { userId, companyId } = await getIdentity();
    if (!companyId) return { data: null, error: "No company for current user." };

    const { data: existing } = await supabase
      .from("takeoffs")
      .select("*")
      .eq("project_id", projectId)
      .is("superseded_at", null)
      .maybeSingle();
    if (existing) return { data: existing, error: null };

    const { data, error } = await supabase
      .from("takeoffs")
      .insert({ company_id: companyId, project_id: projectId, created_by: userId, updated_by: userId })
      .select()
      .single();
    if (error) return { data: null, error: errMsg(error) };
    return { data, error: null };
  } catch (e) {
    return { data: null, error: errMsg(e) };
  }
}

export async function addTakeoffItem(
  takeoffId: string,
  item: Partial<TakeoffItem>
): Promise<DbResult<TakeoffItem>> {
  try {
    const { companyId } = await getIdentity();
    if (!companyId) return { data: null, error: "No company for current user." };
    const row = {
      company_id: companyId,
      takeoff_id: takeoffId,
      layer_id: item.layer_id ?? null,
      type: item.type || "count",
      label: item.label || "",
      qty: item.qty ?? 0,
      unit: item.unit ?? null,
      source: item.source ?? "manual",
      cab: item.cab ?? null,
      notes: item.notes ?? null,
      sort_order: item.sort_order ?? 0,
    };
    const { data, error } = await supabase.from("takeoff_items").insert(row).select().single();
    if (error) return { data: null, error: errMsg(error) };
    return { data, error: null };
  } catch (e) {
    return { data: null, error: errMsg(e) };
  }
}

export async function deleteTakeoffItem(id: string): Promise<DbResult<true>> {
  try {
    const { error } = await supabase.from("takeoff_items").delete().eq("id", id);
    if (error) return { data: null, error: errMsg(error) };
    return { data: true, error: null };
  } catch (e) {
    return { data: null, error: errMsg(e) };
  }
}

/** Patch only the meta JSONB fields (layers, ai_summary, pdf_name) without touching items. */
export async function patchTakeoffMeta(
  projectId: string,
  patch: { layers?: any; ai_summary?: any; pdf_name?: string }
): Promise<DbResult<Takeoff>> {
  try {
    const { userId } = await getIdentity();
    const { data, error } = await supabase
      .from("takeoffs")
      .update({ ...patch, updated_by: userId, updated_at: new Date().toISOString() })
      .eq("project_id", projectId)
      .select()
      .single();
    if (error) return { data: null, error: errMsg(error) };
    return { data, error: null };
  } catch (e) {
    return { data: null, error: errMsg(e) };
  }
}
