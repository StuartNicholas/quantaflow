import { supabase } from "../supabase";
import { getIdentity, errMsg, logActivity, DbResult } from "./_base";

// ─────────────────────────────────────────────────────────────────────────────
// Cabinets — core data model for Verixo.
// Every other module (Estimate, Box Matrix, Procurement, Manufacturing)
// derives its data from here. Never duplicate cabinet data elsewhere.
// ─────────────────────────────────────────────────────────────────────────────

export async function listCabinets(projectId: string): Promise<DbResult<any[]>> {
  try {
    const { data, error } = await supabase
      .from("cabinets")
      .select("*")
      .eq("project_id", projectId)
      .eq("ai_draft", false)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });
    if (error) return { data: null, error: errMsg(error) };
    return { data: data || [], error: null };
  } catch (e) {
    return { data: null, error: errMsg(e) };
  }
}

export async function listDraftCabinets(projectId: string): Promise<DbResult<any[]>> {
  try {
    const { data, error } = await supabase
      .from("cabinets")
      .select("*")
      .eq("project_id", projectId)
      .eq("ai_draft", true)
      .order("ai_confidence", { ascending: true }); // lowest confidence first for review
    if (error) return { data: null, error: errMsg(error) };
    return { data: data || [], error: null };
  } catch (e) {
    return { data: null, error: errMsg(e) };
  }
}

export async function getAllCabinets(projectId: string): Promise<DbResult<any[]>> {
  try {
    const { data, error } = await supabase
      .from("cabinets")
      .select("*")
      .eq("project_id", projectId)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });
    if (error) return { data: null, error: errMsg(error) };
    return { data: data || [], error: null };
  } catch (e) {
    return { data: null, error: errMsg(e) };
  }
}

export async function createCabinet(projectId: string, input: any): Promise<DbResult<any>> {
  try {
    const { userId, companyId } = await getIdentity();
    if (!companyId) return { data: null, error: "No company for current user." };
    const row = { ...input, project_id: projectId, company_id: companyId, created_by: userId, updated_by: userId };
    delete row.id;
    const { data, error } = await supabase.from("cabinets").insert(row).select().single();
    if (error) return { data: null, error: errMsg(error) };
    return { data, error: null };
  } catch (e) {
    return { data: null, error: errMsg(e) };
  }
}

export async function createCabinets(projectId: string, inputs: any[]): Promise<DbResult<any[]>> {
  try {
    const { userId, companyId } = await getIdentity();
    if (!companyId) return { data: null, error: "No company for current user." };
    const rows = inputs.map((input, i) => {
      const row = { ...input, project_id: projectId, company_id: companyId, created_by: userId, updated_by: userId };
      delete row.id;
      if (row.sort_order === undefined) row.sort_order = i;
      return row;
    });
    const { data, error } = await supabase.from("cabinets").insert(rows).select();
    if (error) return { data: null, error: errMsg(error) };
    const isDraft = inputs[0]?.ai_draft;
    await logActivity("cabinet", projectId, "create",
      `Added ${rows.length} cabinet${rows.length !== 1 ? "s" : ""}${isDraft ? " (AI draft)" : ""}`,
      { count: rows.length, ai_draft: !!isDraft }, undefined, projectId);
    return { data: data || [], error: null };
  } catch (e) {
    return { data: null, error: errMsg(e) };
  }
}

export async function updateCabinet(id: string, patch: any): Promise<DbResult<any>> {
  try {
    const { userId } = await getIdentity();
    const clean: any = { ...patch, updated_by: userId };
    delete clean.id;
    delete clean.company_id;
    delete clean.project_id;
    delete clean.created_at;
    delete clean.created_by;
    const { data, error } = await supabase.from("cabinets").update(clean).eq("id", id).select().single();
    if (error) return { data: null, error: errMsg(error) };
    const actionLabel = patch.ai_draft === false ? "approved AI draft cabinet" : "updated cabinet";
    await logActivity("cabinet", id, "update", actionLabel,
      {}, data?.description ?? undefined, data?.project_id ?? undefined);
    return { data, error: null };
  } catch (e) {
    return { data: null, error: errMsg(e) };
  }
}

export async function deleteCabinet(id: string): Promise<DbResult<true>> {
  try {
    const { error } = await supabase.from("cabinets").delete().eq("id", id);
    if (error) return { data: null, error: errMsg(error) };
    await logActivity("cabinet", id, "delete", "Deleted cabinet");
    return { data: true, error: null };
  } catch (e) {
    return { data: null, error: errMsg(e) };
  }
}

export async function deleteAllDraftCabinets(projectId: string): Promise<DbResult<true>> {
  try {
    const { error } = await supabase.from("cabinets").delete().eq("project_id", projectId).eq("ai_draft", true);
    if (error) return { data: null, error: errMsg(error) };
    return { data: true, error: null };
  } catch (e) {
    return { data: null, error: errMsg(e) };
  }
}

export async function approveDraftCabinet(id: string): Promise<DbResult<any>> {
  return updateCabinet(id, { ai_draft: false });
}

export async function approveAllDraftCabinets(projectId: string): Promise<DbResult<true>> {
  try {
    const { userId } = await getIdentity();
    const { error } = await supabase
      .from("cabinets")
      .update({ ai_draft: false, updated_by: userId })
      .eq("project_id", projectId)
      .eq("ai_draft", true);
    if (error) return { data: null, error: errMsg(error) };
    return { data: true, error: null };
  } catch (e) {
    return { data: null, error: errMsg(e) };
  }
}

export async function updateCabinetStatus(
  id: string,
  status: "pending" | "cutting" | "assembled" | "qc" | "dispatched" | "installed"
): Promise<DbResult<any>> {
  return updateCabinet(id, { status });
}

export async function reorderCabinets(updates: { id: string; sort_order: number }[]): Promise<DbResult<true>> {
  try {
    const { userId } = await getIdentity();
    await Promise.all(
      updates.map(({ id, sort_order }) =>
        supabase.from("cabinets").update({ sort_order, updated_by: userId }).eq("id", id)
      )
    );
    return { data: true, error: null };
  } catch (e) {
    return { data: null, error: errMsg(e) };
  }
}

// Summarise cabinets for the estimate view — no data duplication,
// just a grouping helper that returns what the estimate tab needs.
export async function getCabinetSummaryByGroup(
  projectId: string,
  groupBy: "unit_type" | "joinery_type" | "room"
): Promise<DbResult<any[]>> {
  const { data, error } = await listCabinets(projectId);
  if (error) return { data: null, error };
  const rows = data || [];
  const groups: Record<string, { label: string; cabinets: any[]; total_cost: number; total_sell: number }> = {};
  for (const cab of rows) {
    const key = (cab[groupBy] as string) || "Unassigned";
    if (!groups[key]) groups[key] = { label: key, cabinets: [], total_cost: 0, total_sell: 0 };
    groups[key].cabinets.push(cab);
    groups[key].total_cost += Number(cab.unit_cost) || 0;
    groups[key].total_sell += Number(cab.sell_price) || 0;
  }
  return { data: Object.values(groups), error: null };
}
