import { supabase } from "../supabase";
import { errMsg, DbResult } from "./_base";

export interface ActualCost {
  id: string;
  project_id: string;
  category: string;
  description: string;
  amount: number;
  date: string | null;
  supplier: string | null;
  created_by: string | null;
  created_at: string;
}

export async function listActualCosts(projectId: string): Promise<DbResult<ActualCost[]>> {
  try {
    const { data, error } = await supabase
      .from("project_actual_costs")
      .select("*")
      .eq("project_id", projectId)
      .order("created_at", { ascending: true });
    if (error) return { data: null, error: errMsg(error) };
    return { data: data ?? [], error: null };
  } catch (e) {
    return { data: null, error: errMsg(e) };
  }
}

export async function createActualCost(
  projectId: string,
  input: { category: string; description: string; amount: number; date?: string; supplier?: string }
): Promise<DbResult<ActualCost>> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    const { data, error } = await supabase
      .from("project_actual_costs")
      .insert({ project_id: projectId, created_by: user?.id, ...input })
      .select()
      .single();
    if (error) return { data: null, error: errMsg(error) };
    return { data, error: null };
  } catch (e) {
    return { data: null, error: errMsg(e) };
  }
}

export async function deleteActualCost(id: string): Promise<DbResult<null>> {
  try {
    const { error } = await supabase.from("project_actual_costs").delete().eq("id", id);
    if (error) return { data: null, error: errMsg(error) };
    return { data: null, error: null };
  } catch (e) {
    return { data: null, error: errMsg(e) };
  }
}
