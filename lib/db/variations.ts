import { supabase } from "../supabase";
import { getIdentity, errMsg, logActivity, DbResult } from "./_base";

// ─────────────────────────────────────────────────────────────────────────────
// Variations — scope changes after contract sign-off. Each variation is priced
// separately, requires client approval, and approved variations add to the
// contract value tracked by calc().
// ─────────────────────────────────────────────────────────────────────────────

export type Variation = {
  id: string;
  company_id: string;
  project_id: string;
  ref: string;
  description: string;
  amount: number;
  status: "pending" | "approved" | "rejected";
  date?: string | null;
  notes?: string | null;
  created_by?: string | null;
  updated_by?: string | null;
  created_at?: string;
  updated_at?: string;
};

export async function listVariations(
  projectId: string
): Promise<DbResult<Variation[]>> {
  try {
    const { data, error } = await supabase
      .from("variations")
      .select("*")
      .eq("project_id", projectId)
      .order("created_at", { ascending: true });
    if (error) return { data: null, error: errMsg(error) };
    return { data: data || [], error: null };
  } catch (e) {
    return { data: null, error: errMsg(e) };
  }
}

export async function createVariation(
  projectId: string,
  input: Partial<Variation>
): Promise<DbResult<Variation>> {
  try {
    const { userId, companyId } = await getIdentity();
    if (!companyId) return { data: null, error: "No company for current user." };
    const row = {
      company_id: companyId,
      project_id: projectId,
      ref: input.ref || "VAR-001",
      description: input.description || "",
      amount: input.amount ?? 0,
      status: input.status ?? "pending",
      date: input.date ?? null,
      notes: input.notes ?? null,
      created_by: userId,
      updated_by: userId,
    };
    const { data, error } = await supabase
      .from("variations")
      .insert(row)
      .select()
      .single();
    if (error) return { data: null, error: errMsg(error) };
    await logActivity("variation", data.id, "create", `Created variation: ${data.ref}`);
    return { data, error: null };
  } catch (e) {
    return { data: null, error: errMsg(e) };
  }
}

export async function updateVariation(
  id: string,
  patch: Partial<Variation>
): Promise<DbResult<Variation>> {
  try {
    const { userId } = await getIdentity();
    const clean: any = { ...patch, updated_by: userId, updated_at: new Date().toISOString() };
    delete clean.id;
    delete clean.company_id;
    delete clean.project_id;
    const { data, error } = await supabase
      .from("variations")
      .update(clean)
      .eq("id", id)
      .select()
      .single();
    if (error) return { data: null, error: errMsg(error) };
    await logActivity("variation", id, "update", `Updated variation: ${data.ref} → ${data.status}`);
    return { data, error: null };
  } catch (e) {
    return { data: null, error: errMsg(e) };
  }
}

export async function deleteVariation(id: string): Promise<DbResult<true>> {
  try {
    const { error } = await supabase.from("variations").delete().eq("id", id);
    if (error) return { data: null, error: errMsg(error) };
    await logActivity("variation", id, "delete", "Deleted variation");
    return { data: true, error: null };
  } catch (e) {
    return { data: null, error: errMsg(e) };
  }
}
