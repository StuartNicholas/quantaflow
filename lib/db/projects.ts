import { supabase } from "../supabase";
import { getIdentity, errMsg, logActivity, DbResult } from "./_base";

// ─────────────────────────────────────────────────────────────────────────────
// Projects data access. Consolidates the project reads/writes that were
// previously scattered as inline supabase calls. Reads rely on RLS to return
// only the company's rows.
// ─────────────────────────────────────────────────────────────────────────────

export async function listProjects(): Promise<DbResult<any[]>> {
  try {
    const { data, error } = await supabase
      .from("projects")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) return { data: null, error: errMsg(error) };
    return { data: data || [], error: null };
  } catch (e) {
    return { data: null, error: errMsg(e) };
  }
}

export async function createProject(input: any): Promise<DbResult<any>> {
  try {
    const { userId, companyId } = await getIdentity();
    if (!companyId) return { data: null, error: "No company for current user." };
    const row = { ...input, company_id: companyId, created_by: userId, updated_by: userId };
    delete row.id;
    const { data, error } = await supabase.from("projects").insert(row).select().single();
    if (error) return { data: null, error: errMsg(error) };
    await logActivity("project", data.id, "create", `Created project: ${data.name || ""}`);
    return { data, error: null };
  } catch (e) {
    return { data: null, error: errMsg(e) };
  }
}

export async function updateProject(id: string, patch: any): Promise<DbResult<any>> {
  try {
    const { userId } = await getIdentity();
    const clean: any = { ...patch, updated_by: userId, updated_at: new Date().toISOString() };
    delete clean.id;
    delete clean.company_id;
    const { data, error } = await supabase.from("projects").update(clean).eq("id", id).select().single();
    if (error) return { data: null, error: errMsg(error) };
    return { data, error: null };
  } catch (e) {
    return { data: null, error: errMsg(e) };
  }
}

/** Roll a computed estimate total onto the project so dashboard/quote/list read it. */
export async function updateProjectQuoteValue(id: string, total: number): Promise<DbResult<true>> {
  try {
    const { error } = await supabase
      .from("projects")
      .update({ quote_value: total, updated_at: new Date().toISOString() })
      .eq("id", id);
    if (error) return { data: null, error: errMsg(error) };
    return { data: true, error: null };
  } catch (e) {
    return { data: null, error: errMsg(e) };
  }
}

export async function deleteProject(id: string, name?: string): Promise<DbResult<true>> {
  try {
    const { error } = await supabase.from("projects").delete().eq("id", id);
    if (error) return { data: null, error: errMsg(error) };
    await logActivity("project", id, "delete", `Deleted project${name ? `: ${name}` : ""}`);
    return { data: true, error: null };
  } catch (e) {
    return { data: null, error: errMsg(e) };
  }
}
